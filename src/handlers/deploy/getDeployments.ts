import type { FastifyReply, FastifyRequest } from 'fastify'
import { listDeploymentStatuses } from '#utils/deploy/status.ts'

export default async function getDeployments(_: FastifyRequest, res: FastifyReply) {
    return res.send(await listDeploymentStatuses())
}
