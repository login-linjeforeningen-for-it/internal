import config from '#config'
import { S3Client } from 'bun'

export type BackupLocation = 'local' | 'remote'

export type BackupObject = {
    project: string
    filename: string
    size: number
    lastModifiedMs: number
    lastModifiedIso: string
}

type S3Target = {
    endpoint: string
    accessKey: string
    secretKey: string
    bucket: string
    region?: string
}

function createS3Client(target: S3Target, remote = false) {
    if (!target.endpoint || !target.bucket) {
        return null
    }

    return new S3Client({
        endpoint: target.endpoint,
        ...(remote ? { region: target.region } : {}),
        accessKeyId: target.accessKey,
        secretAccessKey: target.secretKey,
        bucket: target.bucket,
        storageClass: 'STANDARD_IA'
    })
}

export function createBackupS3Clients() {
    return {
        localS3: createS3Client(config.backup.s3_local),
        remoteS3: createS3Client(config.backup.s3_remote, true),
    }
}

export async function uploadBackupToS3(s3: S3Client, key: string, encryptedFile: string) {
    await s3.write(key, Bun.file(encryptedFile))
}

type ListBackupObjectsProps = {
    s3: S3Client | null
    extension: string
    onError?: (error: unknown) => void
}

export async function listBackupObjectsFromS3({ s3, extension, onError }: ListBackupObjectsProps) {
    const objects: BackupObject[] = []

    if (!s3) {
        return objects
    }

    try {
        const response = await s3.list()
        if (!response.contents) {
            return objects
        }

        for (const obj of response.contents) {
            if (!obj.key || !obj.lastModified || !obj.size || obj.size <= 0) continue

            const parts = obj.key.split('/')
            if (parts.length !== 2) continue

            const [project, filename] = parts
            if (!filename.endsWith(extension)) continue

            const lastModifiedMs = new Date(obj.lastModified).getTime()

            objects.push({
                project,
                filename,
                size: obj.size,
                lastModifiedMs: Number.isFinite(lastModifiedMs) ? lastModifiedMs : 0,
                lastModifiedIso: new Date(obj.lastModified).toISOString(),
            })
        }
    } catch (error) {
        onError?.(error)
    }

    return objects
}
