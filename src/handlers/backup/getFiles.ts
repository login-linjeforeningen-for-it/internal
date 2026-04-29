import fs from 'fs/promises'
import path from 'path'
import config from '#config'
import { formatSize } from '#utils/format.ts'
import { getBackupDir } from '#utils/backup/utils.ts'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { FastifyReply, FastifyRequest } from 'fastify'

type GetBackupFilesProps = {
    service?: string
    date?: string
}

export default async function getBackupFiles(req: FastifyRequest, res: FastifyReply) {
    const { service, date } = req.query as GetBackupFilesProps

    try {
        const projects = await fs.readdir(config.backup.path).catch(() => [])
        const files: { service: string, file: string, size: string, mtime: string, location: 'local' | 'remote' }[] = []

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

        for (const project of projects) {
            if (service && !project.toLowerCase().includes(service.toLowerCase())) {
                continue
            }

            const projectDir = getBackupDir(project)
            const stats = await fs.stat(projectDir).catch(() => null)
            if (!stats || !stats.isDirectory()) {
                continue
            }

            const projectFiles = await fs.readdir(projectDir).catch(() => [])
            for (const file of projectFiles) {
                if (!file.endsWith(config.backup.encryption.extension)) {
                    continue
                }

                if (date && !file.includes(date.replace(/-/g, ''))) {
                    continue
                }

                const filePath = path.join(projectDir, file)
                const fileStat = await fs.stat(filePath).catch(() => null)
                if (fileStat && fileStat.isFile() && fileStat.size > 0) {
                    files.push({
                        service: project,
                        file,
                        size: formatSize(fileStat.size),
                        mtime: new Date(fileStat.mtimeMs).toISOString(),
                        location: 'local'
                    })
                }
            }
        }

        if (s3 && config.backup.s3.bucket) {
            try {
                const command = new ListObjectsV2Command({
                    Bucket: config.backup.s3.bucket
                })
                const response = await s3.send(command)
                if (response.Contents) {
                    for (const obj of response.Contents) {
                        if (!obj.Key || !obj.LastModified || !obj.Size || obj.Size <= 0) continue
                        const parts = obj.Key.split('/')
                        if (parts.length !== 2) continue
                        const [project, filename] = parts
                        if (!filename.endsWith(config.backup.encryption.extension)) continue
                        if (service && !project.toLowerCase().includes(service.toLowerCase())) continue
                        if (date && !filename.includes(date.replace(/-/g, ''))) continue
                        files.push({
                            service: project,
                            file: filename,
                            size: formatSize(obj.Size),
                            mtime: obj.LastModified.toISOString(),
                            location: 'remote'
                        })
                    }
                }
            } catch (e) {
                console.error('Failed to list S3 files:', e)
            }
        }

        files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())

        res.send(files)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
