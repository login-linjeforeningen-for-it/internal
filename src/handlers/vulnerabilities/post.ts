import type { FastifyReply, FastifyRequest } from 'fastify'
import { triggerDockerScoutScanInBackground } from '#utils/vulnerabilities/scout.ts'

export default async function runVulnerabilityScan(_: FastifyRequest, res: FastifyReply) {
    try {
        const { started, status } = triggerDockerScoutScanInBackground()

        if (started) {
            res.status(202).send({
                message: 'Docker Scout vulnerability scan started in background',
                status
            })
            return
        }

        res.status(202).send({
            message: 'Docker Scout vulnerability scan is already running',
            status
        })
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
