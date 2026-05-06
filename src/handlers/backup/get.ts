import { formatSize } from '#utils/format.ts'
import getPostgresContainers from '#utils/backup/containers.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import getBackupProjectStats from '#utils/backup/getBackupProjectStats.ts'

export default async function getBackupStats(_: FastifyRequest, res: FastifyReply) {
    try {
        const containers = await getPostgresContainers({ all: true })
        const backupStatsByProject = await getBackupProjectStats()
        const containersByProject = new Map(containers.map((container) => [container.project, container]))
        const discoveredProjects = new Set([
            ...backupStatsByProject.keys(),
            ...containersByProject.keys(),
        ])

        const stats = await Promise.all(Array.from(discoveredProjects).sort().map(async (project) => {
            const container = containersByProject.get(project)
            const backupStats = backupStatsByProject.get(project) || { size: 0, time: 0 }
            const info = container
                ? {
                    id: container.id,
                    name: container.name,
                    status: container.status,
                    database: null as string | null,
                    lastBackup: null as string | null,
                    totalStorage: '0 B',
                    error: null as string | null,
                }
                : {
                    id: project,
                    name: project,
                    status: 'Backup only',
                    database: null as string | null,
                    lastBackup: null as string | null,
                    totalStorage: '0 B',
                    error: null as string | null,
                }

            if (!container || !container.workingDir || !container.project) {
                return {
                    ...info,
                    totalStorage: formatSize(backupStats.size),
                    lastBackup: backupStats.time ? new Date(backupStats.time).toISOString() : null,
                }
            }

            try {
                const { DB } = await getContainerCredentials({ id: container.id, workingDir: container.workingDir })

                if (!container.status.startsWith('Up')) {
                    info.error = 'Container not running'
                }

                return {
                    ...info,
                    database: DB,
                    totalStorage: formatSize(backupStats.size),
                    lastBackup: backupStats.time ? new Date(backupStats.time).toISOString() : null,
                }
            } catch {
                return {
                    ...info,
                    database: null,
                    totalStorage: formatSize(backupStats.size),
                    lastBackup: backupStats.time ? new Date(backupStats.time).toISOString() : null,
                }
            }
        }))

        res.send(stats)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
