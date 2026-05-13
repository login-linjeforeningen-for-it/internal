import type { FastifyReply, FastifyRequest } from 'fastify'
import { getOrLoadScanStatus } from '#utils/vulnerabilities/scan.ts'
import { loadReport } from '#utils/vulnerabilities/storage.ts'

export default async function getVulnerabilities(_: FastifyRequest, res: FastifyReply) {
    try {
        const [report, scanStatus] = await Promise.all([loadReport(), getOrLoadScanStatus()])
        res.send({ ...report, scanStatus })
    } catch (error) {
        res.status(500).send({ error: (error as Error).message })
    }
}
