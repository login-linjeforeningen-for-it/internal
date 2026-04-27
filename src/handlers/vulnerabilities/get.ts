import type { FastifyReply, FastifyRequest } from 'fastify'
import getDockerScoutScanStatus from '#utils/vulnerabilities/getDockerScoutScanStatus.ts'
import {
    loadStoredVulnerabilityReport,
    loadStoredVulnerabilityScanStatus,
} from '#utils/vulnerabilities/storage.ts'

export default async function getVulnerabilities(_: FastifyRequest, res: FastifyReply) {
    try {
        const report = await loadStoredVulnerabilityReport()
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
