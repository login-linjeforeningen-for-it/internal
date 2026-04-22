import type { FastifyReply, FastifyRequest } from 'fastify'
import { getDeploymentStatus } from '#utils/deploy/status.ts'

export default async function getDeployment(req: FastifyRequest, res: FastifyReply) {
    const { id } = req.params as { id: string }
    const deployment = await getDeploymentStatus(id)
    if (!deployment) {
        return res.status(404).send({ error: 'Deployment target not found' })
    }

    return res.send(deployment)
}
