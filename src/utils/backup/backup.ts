import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    S3Client,
    UploadPartCommand,
    type CreateMultipartUploadCommandOutput,
    type UploadPartCommandOutput,
} from '@aws-sdk/client-s3'
import config from '#config'
import getPostgresContainers from '#utils/backup/containers.ts'
import { getBackupDir } from '#utils/backup/utils.ts'
import { encryptBackupFile } from '#utils/backup/encryption.ts'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import shellEscape from '#utils/db/overview/shellEscape.ts'

const execAsync = promisify(exec)
const S3_UPLOAD_TIMEOUT_MS = Number(process.env.BACKUP_S3_UPLOAD_TIMEOUT_MS || 10 * 60 * 1000)
const S3_PART_SIZE = Number(process.env.BACKUP_S3_PART_SIZE || 16 * 1024 * 1024)

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

async function uploadBackupToS3(s3: S3Client, bucket: string, key: string, encryptedFile: string) {
    const file = await fs.readFile(encryptedFile)
    let uploadId: string | undefined

    try {
        const created = await sendS3WithTimeout<CreateMultipartUploadCommandOutput>(s3, new CreateMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            StorageClass: 'STANDARD_IA'
        }))
        uploadId = created.UploadId

        if (!uploadId) {
            throw new Error('S3 did not return an upload id')
        }

        const parts = []
        let partNumber = 1
        for (let offset = 0; offset < file.length; offset += S3_PART_SIZE) {
            const end = Math.min(offset + S3_PART_SIZE, file.length)
            const uploaded = await sendS3WithTimeout<UploadPartCommandOutput>(s3, new UploadPartCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: file.subarray(offset, end)
            }))

            if (!uploaded.ETag) {
                throw new Error(`S3 did not return an ETag for part ${partNumber}`)
            }

            parts.push({ ETag: uploaded.ETag, PartNumber: partNumber })
            partNumber += 1
        }

        await sendS3WithTimeout(s3, new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts }
        }))
    } catch (error) {
        if (uploadId) {
            await s3.send(new AbortMultipartUploadCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId
            })).catch(() => { })
        }

        throw error
    }
}

async function sendS3WithTimeout<T>(s3: S3Client, command: any): Promise<T> {
    const controller = new AbortController()
    let timeout: NodeJS.Timeout | null = null

    try {
        const request = s3.send(command as any, { abortSignal: controller.signal })
        request.catch(() => { })

        return await Promise.race([
            request,
            new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    controller.abort()
                    reject(new Error(`S3 request timed out after ${S3_UPLOAD_TIMEOUT_MS}ms`))
                }, S3_UPLOAD_TIMEOUT_MS)
            })
        ]) as T
    } finally {
        if (timeout) {
            clearTimeout(timeout)
        }
    }
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
        let file: string | null = null

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
            file = path.join(dir, `${DB}_${stamp}.dump`)
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
                const key = `${project}/${path.basename(encryptedFile)}`
                try {
                    await uploadBackupToS3(s3, config.backup.s3.bucket, key, encryptedFile)
                    console.log(`\tUploaded to S3: ${key}`)
                } catch (e: any) {
                    const error = `S3 upload failed: ${e.message || e}`
                    result.failures.push({ container: name, error })
                    console.error(`\t${error}`)
                }
            }
        } catch (e: any) {
            const error = e.message || String(e)
            if (file) {
                await fs.unlink(file).catch(() => { })
            }
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
