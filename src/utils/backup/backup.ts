import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import getPostgresContainers from '#utils/backup/containers.ts'
import { encryptBackupFile } from '#utils/backup/encryption.ts'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import shellEscape from '#utils/db/overview/shellEscape.ts'
import { createBackupS3Clients, uploadBackupToS3 } from './s3'

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

    const { localS3: s3Local, remoteS3: s3Remote } = createBackupS3Clients()
    const uploadTargets = [['local', s3Local], ['remote', s3Remote]] as const

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
            const command = `docker exec -e PGPASSWORD=${shellEscape(DB_PASSWORD)} ${shellEscape(id)}`
                + ` pg_dump -Fc -c -U ${shellEscape(DB_USER)} ${shellEscape(DB)} > ${shellEscape(file)}`
            await execAsync(command)

            if ((await fs.stat(file)).size === 0) {
                throw new Error('Empty backup')
            }
            const encryptedFile = await encryptBackupFile(file)
            const key = `${project}/${path.basename(encryptedFile)}`
            let uploaded = false
            const uploadErrors: string[] = []

            for (const [label, s3] of uploadTargets) {
                if (!s3) continue
                try {
                    await uploadBackupToS3(s3, key, encryptedFile)
                    uploaded = true
                    console.log(`\tUploaded to ${label} S3: ${key}`)
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e)
                    const error = `${label[0].toUpperCase()}${label.slice(1)} S3 upload failed: ${msg}`
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
        } catch (e: unknown) {
            const error = e instanceof Error ? e.message : String(e)
            result.failures.push({ container: name, error })
            console.error(`\tFailed ${name}:`, error)
        } finally {
            if (tempDir) {
                await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { })
            }
        }
    }))

    if (!result.backedUp) {
        throw new Error(
            result.failures.map(failure => `${failure.container}: ${failure.error}`).join('; ') ||
            'No database backups were created'
        )
    }

    return result
}
