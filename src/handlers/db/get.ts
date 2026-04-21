import type { FastifyReply, FastifyRequest } from 'fastify'
import getDatabaseOverview from '#utils/db/overview.ts'

export default async function getDatabaseOverviewHandler(_: FastifyRequest, res: FastifyReply) {
    try {
        const overview = await getDatabaseOverview()
        res.send(overview)
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
