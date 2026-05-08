import config from '#config'
import { formatSize } from '#utils/format.ts'
import { createBackupS3Clients, listBackupObjectsFromS3 } from '#utils/backup/s3.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'

type GetBackupFilesProps = {
    service?: string
    date?: string
}

export default async function getBackupFiles(req: FastifyRequest, res: FastifyReply) {
    const { service, date } = req.query as GetBackupFilesProps
    const serviceQuery = service?.toLowerCase()
    const dateQuery = date?.replace(/-/g, '')

    try {
        const files: { service: string, file: string, size: string, mtime: string, location: 'local' | 'remote' }[] = []
        const { localS3, remoteS3 } = createBackupS3Clients()
        const extension = config.backup.encryption.extension
        const matches = (project: string, filename: string) =>
            (!serviceQuery || project.toLowerCase().includes(serviceQuery)) &&
            (!dateQuery || filename.includes(dateQuery))

        for (const [location, s3] of [['local', localS3], ['remote', remoteS3]] as const) {
            const backupObjects = await listBackupObjectsFromS3({
                s3,
                extension,
                onError: (error) => {
                    console.error(`Failed to list ${location} S3 files:`, error)
                },
            })

            for (const object of backupObjects) {
                if (!matches(object.project, object.filename)) continue

                files.push({
                    service: object.project,
                    file: object.filename,
                    size: formatSize(object.size),
                    mtime: object.lastModifiedIso,
                    location,
                })
            }
        }

        files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())

        res.send(files)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
