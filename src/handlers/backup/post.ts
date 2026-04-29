import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import path from 'path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { getBackupDir } from '#utils/backup/utils.ts'
import getPostgresContainers from '#utils/backup/containers.ts'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import config from '#config'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import shellEscape from '#utils/db/overview/shellEscape.ts'
import {
    encryptBackupFile,
    isEncryptedBackupFile
} from '#utils/backup/encryption.ts'

const execAsync = promisify(exec)

type RestoreBackupProps = {
    service: string
    file: string
}

export default async function restoreBackup(req: FastifyRequest, res: FastifyReply) {
    const { service, file } = req.body as RestoreBackupProps
    let backupFilePath = ''
    let restoreFilePath = ''
    let preRestoreBackupFile = ''
    let downloadedRemoteFile = false

    if (!service || !file) {
        return res.status(400).send({ error: 'Missing service or file' })
    }

    try {
        const containers = await getPostgresContainers({ filterProject: service })
        const container = containers[0]
        
        if (!container) {
            return res.status(404).send({ error: 'Container not found' })
        }

        const { id: containerId, status, project, workingDir } = container

        if (!project || !workingDir) {
            return res.status(400).send({ error: 'Container missing required labels' })
        }

        if (!status.startsWith('Up')) {
             return res.status(400).send({ error: 'Container is not running' })
        }

        const { DB, DB_USER, DB_PASSWORD } = await getContainerCredentials({ id: containerId, workingDir })

        if (!DB || !DB_USER) {
            return res.status(400).send({ error: 'Missing database name or user in .env' })
        }

        const backupDir = getBackupDir(project)
        await fs.mkdir(backupDir, { recursive: true })
        backupFilePath = path.join(backupDir, file)
        restoreFilePath = backupFilePath

        try {
            await fs.access(backupFilePath)
        } catch {
            if (config.backup.s3 && config.backup.s3.bucket) {
                const s3 = new S3Client({
                    endpoint: config.backup.s3.endpoint,
                    region: config.backup.s3.region,
                    credentials: {
                        accessKeyId: config.backup.s3.accessKey,
                        secretAccessKey: config.backup.s3.secretKey
                    },
                    forcePathStyle: true
                })
                try {
                    const command = new GetObjectCommand({
                        Bucket: config.backup.s3.bucket,
                        Key: `${project}/${file}`
                    })
                    const response = await s3.send(command)
                    if (response.Body) {
                        const writeStream = createWriteStream(backupFilePath)
                        ;(response.Body as any).pipe(writeStream)
                        await new Promise((resolve, reject) => {
                            writeStream.on('finish', resolve)
                            writeStream.on('error', reject)
                        })
                        downloadedRemoteFile = true
                    } else {
                        return res.status(404).send({ error: 'Backup file not found locally or remotely' })
                    }
                } catch (e) {
                    return res.status(404).send({ error: 'Backup file not found locally or remotely' })
                }
            } else {
                return res.status(404).send({ error: 'Backup file not found' })
            }
        }

        if (await isEncryptedBackupFile(backupFilePath)) {
            return res.status(400).send({ error: 'Backup file is encrypted and cannot be restored here (private key not available)' })
        }

        const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(/\D/g, '')
        preRestoreBackupFile = path.join(backupDir, `${DB}_${stamp}_pre_restore.dump`)

        const preRestoreBackupCommand = [
            'docker exec',
            `-e PGPASSWORD=${shellEscape(DB_PASSWORD)}`,
            shellEscape(containerId),
            'pg_dump -Fc -c',
            `-U ${shellEscape(DB_USER)}`,
            shellEscape(DB),
            `> ${shellEscape(preRestoreBackupFile)}`
        ].join(' ')
        await execAsync(preRestoreBackupCommand)

        if ((await fs.stat(preRestoreBackupFile)).size === 0) {
            await fs.unlink(preRestoreBackupFile).catch(() => { })
            throw new Error('Failed to create pre-restore backup')
        }

        await encryptBackupFile(preRestoreBackupFile)

        restoreFilePath = backupFilePath

        const command = [
            'docker exec -i',
            `-e PGPASSWORD=${shellEscape(DB_PASSWORD)}`,
            shellEscape(containerId),
            'pg_restore',
            '--clean',
            '--if-exists',
            '--no-owner',
            `-U ${shellEscape(DB_USER)}`,
            `-d ${shellEscape(DB)}`,
            `< ${shellEscape(restoreFilePath)}`
        ].join(' ')
        await execAsync(command)

        res.send({ message: 'Backup restored successfully' })
    } catch (e: any) {
        res.status(500).send({ error: e.message })
    } finally {
        if (preRestoreBackupFile) {
            await fs.unlink(preRestoreBackupFile).catch(() => {})
        }
        if (downloadedRemoteFile && backupFilePath) {
            await fs.unlink(backupFilePath).catch(() => {})
        }
    }
}
