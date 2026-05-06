import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { S3Client } from 'bun'
import config from '#config'
import getPostgresContainers from '#utils/backup/containers.ts'
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

async function uploadBackupToS3(s3: S3Client, key: string, encryptedFile: string) {
    await s3.write(key, Bun.file(encryptedFile))
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

    let s3Local: S3Client | null = null
    if (config.backup.s3_local && config.backup.s3_local.endpoint && config.backup.s3_local.bucket) {
        s3Local = new S3Client({
            endpoint: config.backup.s3_local.endpoint,
            accessKeyId: config.backup.s3_local.accessKey,
            secretAccessKey: config.backup.s3_local.secretKey,
            bucket: config.backup.s3_local.bucket
        })
    }

    let s3Remote: S3Client | null = null
    if (config.backup.s3_remote && config.backup.s3_remote.endpoint && config.backup.s3_remote.bucket) {
        s3Remote = new S3Client({
            endpoint: config.backup.s3_remote.endpoint,
            region: config.backup.s3_remote.region,
            accessKeyId: config.backup.s3_remote.accessKey,
            secretAccessKey: config.backup.s3_remote.secretKey,
            bucket: config.backup.s3_remote.bucket,
            storageClass: 'STANDARD_IA'
        })
    }

    if (!s3Local && !s3Remote) {
        throw new Error('No S3 target is configured for backups')
    }

    await Promise.all(containers.map(async (container) => {
        const { id, name, project, workingDir } = container
        let tempDir = ''

        if (!project || !workingDir) {
            result.failures.push({ container: name, error: 'Missing compose labels' })
            return
        }

        try {
            const { DB, DB_USER, DB_PASSWORD } = await getContainerCredentials({ id, workingDir })

            const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(/\D/g, '')
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tekkom-backup-'))
            const file = path.join(tempDir, `${DB}_${stamp}.dump`)
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
                throw new Error('Empty backup')
            }
            const encryptedFile = await encryptBackupFile(file)
            const key = `${project}/${path.basename(encryptedFile)}`
            let uploaded = false
            const uploadErrors: string[] = []

            if (s3Local) {
                try {
                    await uploadBackupToS3(s3Local, key, encryptedFile)
                    uploaded = true
                    console.log(`\tUploaded to local S3: ${key}`)
                } catch (e: any) {
                    const error = `Local S3 upload failed: ${e.message || e}`
                    uploadErrors.push(error)
                    console.error(`\t${error}`)
                }
            }

            if (s3Remote) {
                try {
                    await uploadBackupToS3(s3Remote, key, encryptedFile)
                    uploaded = true
                    console.log(`\tUploaded to remote S3: ${key}`)
                } catch (e: any) {
                    const error = `Remote S3 upload failed: ${e.message || e}`
                    uploadErrors.push(error)
                    console.error(`\t${error}`)
                }
            }

            if (!uploaded) {
                result.failures.push({ container: name, error: uploadErrors.join('; ') || 'Upload failed' })
                return
            }

            result.files.push(key)
            result.backedUp += 1
        } catch (e: any) {
            const error = e.message || String(e)
            result.failures.push({ container: name, error })
            console.error(`\tFailed ${name}:`, error)
        } finally {
            if (tempDir) {
                await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { })
            }
        }
    }))

    if (!result.backedUp) {
        const reason = result.failures.map(failure => `${failure.container}: ${failure.error}`).join('; ')
        throw new Error(reason || 'No database backups were created')
    }

    return result
}
