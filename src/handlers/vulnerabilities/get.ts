import type { FastifyReply, FastifyRequest } from 'fastify'
import { getDockerScoutScanStatus, loadVulnerabilityReport } from '#utils/vulnerabilities/scout.ts'

export default async function getVulnerabilities(_: FastifyRequest, res: FastifyReply) {
    try {
        const report = await loadVulnerabilityReport()
        res.send({
            ...report,
            scanStatus: getDockerScoutScanStatus()
        })
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
