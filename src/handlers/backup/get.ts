import fs from 'fs/promises'
import path from 'path'
import config from '#config'
import { exec } from 'child_process'
import { promisify } from 'util'
import { CronExpressionParser } from 'cron-parser'
import { formatSize } from '#utils/format.ts'
import { getBackupDir } from '#utils/backup/utils.ts'
import getPostgresContainers from '#utils/backup/containers.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import shellEscape from '#utils/db/overview/shellEscape.ts'


const execAsync = promisify(exec)

export default async function getBackupStats(_: FastifyRequest, res: FastifyReply) {
    try {
        const containers = await getPostgresContainers({ all: true })

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

                const backupDir = getBackupDir(project)
                const [dbSize, stats] = await Promise.all([
                    info.dbSize === 'Unknown'
                        ? execAsync(
                            `docker exec -e PGPASSWORD=${shellEscape(DB_PASSWORD)} ${shellEscape(id)} psql -U ${shellEscape(DB_USER)} -d ${shellEscape(DB)} -t -c ${shellEscape(`SELECT pg_database_size('${DB}');`)}`
                        ).then((r) => r.stdout.trim()).catch(() => 'Unknown')
                        : Promise.resolve(info.dbSize),
                    fs.readdir(backupDir).then(async (files) => {
                        const stats = await Promise.all(
                            files
                                .filter((file) => file.endsWith(config.backup.encryption.extension))
                                .map((file) => fs.stat(path.join(backupDir, file)).catch(() => null))
                        )

                        return stats.reduce(
                            (accumulator, stat) => stat
                                ? { size: accumulator.size + stat.size, time: Math.max(accumulator.time, stat.mtimeMs) }
                                : accumulator,
                            { size: 0, time: 0 }
                        )
                    }).catch(() => ({ size: 0, time: 0 }))
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
