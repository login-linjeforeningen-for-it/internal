import config from '#config'
import { formatSize } from '#utils/format.ts'
import { S3Client } from 'bun'
import type { FastifyReply, FastifyRequest } from 'fastify'

type GetBackupFilesProps = {
    service?: string
    date?: string
}

export default async function getBackupFiles(req: FastifyRequest, res: FastifyReply) {
    const { service, date } = req.query as GetBackupFilesProps

    try {
        const files: { service: string, file: string, size: string, mtime: string, location: 'local' | 'remote' }[] = []

        let localS3: S3Client | null = null
        if (config.backup.s3_local && config.backup.s3_local.endpoint && config.backup.s3_local.bucket) {
            localS3 = new S3Client({
                endpoint: config.backup.s3_local.endpoint,
                accessKeyId: config.backup.s3_local.accessKey,
                secretAccessKey: config.backup.s3_local.secretKey,
                bucket: config.backup.s3_local.bucket
            })
        }

        let remoteS3: S3Client | null = null
        if (config.backup.s3_remote && config.backup.s3_remote.endpoint && config.backup.s3_remote.bucket) {
            remoteS3 = new S3Client({
                endpoint: config.backup.s3_remote.endpoint,
                region: config.backup.s3_remote.region,
                accessKeyId: config.backup.s3_remote.accessKey,
                secretAccessKey: config.backup.s3_remote.secretKey,
                bucket: config.backup.s3_remote.bucket
            })
        }

        const extension = config.backup.encryption.extension
        const addFromS3 = async (s3: S3Client | null, location: 'local' | 'remote') => {
            if (!s3) return
            try {
                const response = await s3.list()
                if (response.contents) {
                    for (const obj of response.contents) {
                        if (!obj.key || !obj.lastModified || !obj.size || obj.size <= 0) continue
                        const parts = obj.key.split('/')
                        if (parts.length !== 2) continue
                        const [project, filename] = parts
                        if (!filename.endsWith(extension)) continue
                        if (service && !project.toLowerCase().includes(service.toLowerCase())) continue
                        if (date && !filename.includes(date.replace(/-/g, ''))) continue
                        files.push({
                            service: project,
                            file: filename,
                            size: formatSize(obj.size),
                            mtime: new Date(obj.lastModified).toISOString(),
                            location
                        })
                    }
                }
            } catch (e) {
                console.error(`Failed to list ${location} S3 files:`, e)
            }
        }

        await addFromS3(localS3, 'local')
        await addFromS3(remoteS3, 'remote')

        files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())

        res.send(files)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
