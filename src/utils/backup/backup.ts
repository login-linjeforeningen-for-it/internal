import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import config from '#config'
import getPostgresContainers from '#utils/backup/containers.ts'
import { getBackupDir } from '#utils/backup/utils.ts'
import { encryptBackupFile } from '#utils/backup/encryption.ts'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import shellEscape from '#utils/db/overview/shellEscape.ts'

const execAsync = promisify(exec)

type BackupFailure = {
    container: string
    error: string
}

export type BackupResult = {
    files: string[]
    failures: BackupFailure[]
    backedUp: number
    discovered: number
}

export async function runBackup() {
    const containers = await getPostgresContainers({ all: false })
    const result: BackupResult = {
        files: [],
        failures: [],
        backedUp: 0,
        discovered: containers.length
    }

    if (!containers.length) {
        throw new Error('No running PostgreSQL containers found')
    }

    let s3: S3Client | null = null
    if (config.backup.s3 && config.backup.s3.endpoint && config.backup.s3.bucket) {
        s3 = new S3Client({
            endpoint: config.backup.s3.endpoint,
            region: config.backup.s3.region,
            credentials: {
                accessKeyId: config.backup.s3.accessKey,
                secretAccessKey: config.backup.s3.secretKey
            },
            forcePathStyle: true
        })
    }

    const projects = new Set<string>()

    await Promise.all(containers.map(async (container) => {
        const { id, name, project, workingDir } = container

        if (!project || !workingDir) {
            result.failures.push({ container: name, error: 'Missing compose labels' })
            return
        }

        try {
            const { DB, DB_USER, DB_PASSWORD } = await getContainerCredentials({ id, workingDir })

            projects.add(project)
            const dir = getBackupDir(project)
            await fs.mkdir(dir, { recursive: true })

            const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(/\D/g, '')
            const file = path.join(dir, `${DB}_${stamp}.dump`)
            const command = [
                'docker exec',
                `-e PGPASSWORD=${shellEscape(DB_PASSWORD)}`,
                shellEscape(id),
                'pg_dump -Fc -c',
                `-U ${shellEscape(DB_USER)}`,
                shellEscape(DB),
                `> ${shellEscape(file)}`
            ].join(' ')
            await execAsync(command)

            if ((await fs.stat(file)).size === 0) {
                await fs.unlink(file).catch(() => { })
                throw new Error('Empty backup')
            }
            const encryptedFile = await encryptBackupFile(file)
            result.files.push(encryptedFile)
            result.backedUp += 1
            console.log(`\tSaved: ${encryptedFile}`)

            if (s3 && config.backup.s3.bucket) {
                try {
                    await s3.send(new PutObjectCommand({
                        Bucket: config.backup.s3.bucket,
                        Key: `${project}/${path.basename(encryptedFile)}`,
                        Body: createReadStream(encryptedFile),
                        StorageClass: 'STANDARD_IA'
                    }))
                    console.log(`\tUploaded to S3: ${project}/${path.basename(encryptedFile)}`)
                } catch (e: any) {
                    const error = `S3 upload failed: ${e.message || e}`
                    result.failures.push({ container: name, error })
                    console.error(`\t${error}`)
                }
            }
        } catch (e: any) {
            const error = e.message || String(e)
            result.failures.push({ container: name, error })
            console.error(`\tFailed ${name}:`, error)
        }
    }))

    const limit = Date.now() - (Number(config.backup.retention) || 7) * 86400000
    for (const p of projects) {
        const dir = getBackupDir(p)
        const files = await fs.readdir(dir).catch(() => [])
        for (const f of files) {
            const fp = path.join(dir, f)
            if ((await fs.stat(fp)).mtimeMs < limit) await fs.unlink(fp).catch(() => { })
        }
    }

    if (!result.backedUp) {
        const reason = result.failures.map(failure => `${failure.container}: ${failure.error}`).join('; ')
        throw new Error(reason || 'No database backups were created')
    }

    return result
}
