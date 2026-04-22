import type { FastifyReply, FastifyRequest } from 'fastify'
import { runDeployment } from '#utils/deploy/status.ts'

export default async function postDeploy(req: FastifyRequest, res: FastifyReply) {
    const { id } = req.params as { id: string }
    try {
        return res.send(await runDeployment(id))
    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
