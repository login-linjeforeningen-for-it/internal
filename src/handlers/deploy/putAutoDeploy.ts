import type { FastifyReply, FastifyRequest } from 'fastify'
import { setAutoDeploy } from '#utils/deploy/status.ts'

export default async function putAutoDeploy(
    req: FastifyRequest,
    res: FastifyReply
) {
    const { id } = req.params as { id: string }
    const { enabled } = req.body as { enabled?: boolean }
    try {
        return res.send(await setAutoDeploy(id, Boolean(enabled)))
    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
