import { formatSize } from '#utils/format.ts'
import getPostgresContainers, { getProjectNames } from '#utils/backup/containers.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import getContainerCredentials from '#utils/db/overview/getContainerCredentials.ts'
import getBackupProjectStats from '#utils/backup/getBackupProjectStats.ts'

const EMPTY_STATS = { size: 0, time: 0 }

function toBackupStorage({ size, time }: { size: number, time: number }) {
    return {
        totalStorage: formatSize(size),
        lastBackup: time ? new Date(time).toISOString() : null,
    }
}

function createBackupInfo(project: string, container?: { id: string, name: string, status: string }) {
    return {
        id: container?.id ?? project,
        name: container?.name ?? project,
        status: container?.status ?? 'Backup only',
        database: null as string | null,
        error: null as string | null,
    }
}

export default async function getBackupStats(_: FastifyRequest, res: FastifyReply) {
    try {
        const containers = await getPostgresContainers({ all: true })
        const backupStatsByProject = await getBackupProjectStats()
        const containersByProject = new Map(containers.map((container) => [container.project, container]))
        const discoveredProjects = getProjectNames(containers, backupStatsByProject.keys())

        const stats = await Promise.all([...discoveredProjects].sort().map(async (project) => {
            const container = containersByProject.get(project)
            const storage = toBackupStorage(backupStatsByProject.get(project) || EMPTY_STATS)
            const info = createBackupInfo(project, container)

            if (!container || !container.workingDir) return { ...info, ...storage }

            let database: string | null = null

            try {
                ({ DB: database } = await getContainerCredentials({ id: container.id, workingDir: container.workingDir }))
                if (!container.status.startsWith('Up')) info.error = 'Container not running'
            } catch { /* ignore */ }

            return { ...info, database, ...storage }
        }))

        res.send(stats)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
