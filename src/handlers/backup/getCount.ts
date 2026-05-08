import getPostgresContainers, { getProjectNames } from '#utils/backup/containers.ts'
import getBackupProjectStats from '#utils/backup/getBackupProjectStats.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'

export default async function getDatabaseCount(_: FastifyRequest, res: FastifyReply) {
    try {
        const containers = await getPostgresContainers({ all: true })
        const backupProjects = await getBackupProjectStats()
        const count = getProjectNames(containers, backupProjects.keys()).size

        res.send({ count })
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
