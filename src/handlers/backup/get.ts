import config from '#config'
import { exec } from 'child_process'
import { promisify } from 'util'
import { CronExpressionParser } from 'cron-parser'
import { formatSize } from '#utils/format.ts'
import getPostgresContainers from '#utils/backup/containers.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import shellEscape from '#utils/db/overview/shellEscape.ts'
import { S3Client } from 'bun'


const execAsync = promisify(exec)

export default async function getBackupStats(_: FastifyRequest, res: FastifyReply) {
    try {
        const containers = await getPostgresContainers({ all: true })

        let localS3: S3Client | null = null
        if (config.backup.s3_local && config.backup.s3_local.endpoint && config.backup.s3_local.bucket) {
            localS3 = new S3Client({
                endpoint: config.backup.s3_local.endpoint,
                accessKeyId: config.backup.s3_local.accessKey,
                secretAccessKey: config.backup.s3_local.secretKey,
                bucket: config.backup.s3_local.bucket
            })
        }

        const localStatsByProject = new Map<string, { size: number, time: number }>()
        if (localS3) {
            try {
                const response = await localS3.list()
                if (response.contents) {
                    const extension = config.backup.encryption.extension
                    for (const obj of response.contents) {
                        if (!obj.key || !obj.lastModified || !obj.size || obj.size <= 0) continue
                        const parts = obj.key.split('/')
                        if (parts.length !== 2) continue
                        const [project, filename] = parts
                        if (!filename.endsWith(extension)) continue
                        const current = localStatsByProject.get(project) || { size: 0, time: 0 }
                        const lastModifiedMs = new Date(obj.lastModified).getTime()
                        localStatsByProject.set(project, {
                            size: current.size + obj.size,
                            time: Math.max(current.time, Number.isFinite(lastModifiedMs) ? lastModifiedMs : 0)
                        })
                    }
                }
            } catch (e) {
                console.error('Failed to list local S3 backups:', e)
            }
        }

        const nextBackup = (() => {
            try {
                return CronExpressionParser.parse(config.backup.schedule).next().toISOString()
            } catch { 
                return 'Invalid schedule'
            }
        })()

        const stats = await Promise.all(containers.map(async (container) => {
            const { id, name, status, project, workingDir } = container
            const info = {
                id,
                name,
                status,
                lastBackup: null as string | null,
                nextBackup,
                totalStorage: '0 B',
                dbSize: 'Unknown',
                error: null as string | null
            }

            if (!project || !workingDir) {
                return { ...info, error: 'Missing labels' }
            }

            try {
                const { DB, DB_USER, DB_PASSWORD } = await getContainerCredentials({ id, workingDir })

                if (!status.startsWith('Up')) {
                    info.error = 'Container not running'
                }

                const [dbSize, stats] = await Promise.all([
                    info.dbSize === 'Unknown'
                        ? execAsync(
                            `docker exec -e PGPASSWORD=${shellEscape(DB_PASSWORD)} ${shellEscape(id)} psql -U ${shellEscape(DB_USER)} -d ${shellEscape(DB)} -t -c ${shellEscape(`SELECT pg_database_size('${DB}');`)}`
                        ).then((r) => r.stdout.trim()).catch(() => 'Unknown')
                        : Promise.resolve(info.dbSize),
                    Promise.resolve(localStatsByProject.get(project) || { size: 0, time: 0 })
                ])

                return {
                    ...info,
                    dbSize: isNaN(Number(dbSize)) ? dbSize : formatSize(Number(dbSize)),
                    totalStorage: formatSize(stats.size),
                    lastBackup: stats.time ? new Date(stats.time).toISOString() : null
                }
            } catch {
                return { ...info, dbSize: 'Error' }
            }
        }))

        res.send(stats)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
