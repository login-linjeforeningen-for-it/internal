import type { FastifyReply, FastifyRequest } from 'fastify'
import { getDockerScoutScanStatus, loadVulnerabilityReport } from '#utils/vulnerabilities/scout.ts'
import { loadStoredVulnerabilityScanStatus } from '#utils/vulnerabilities/storage.ts'

export default async function getVulnerabilities(_: FastifyRequest, res: FastifyReply) {
    try {
        const report = await loadVulnerabilityReport()
        const runtimeStatus = getDockerScoutScanStatus()
        const storedStatus = runtimeStatus.isRunning
            ? runtimeStatus
            : await loadStoredVulnerabilityScanStatus()
        res.send({
            ...report,
            scanStatus: storedStatus
        })
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
