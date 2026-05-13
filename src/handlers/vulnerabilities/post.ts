import type { FastifyReply, FastifyRequest } from 'fastify'
import { triggerScan } from '#utils/vulnerabilities/scan.ts'

export default async function runVulnerabilityScan(_: FastifyRequest, res: FastifyReply) {
    try {
        const { started, status } = triggerScan()
        res.status(202).send({
            message: started ? 'Vulnerability scan started' : 'Vulnerability scan already running',
            status,
        })
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
