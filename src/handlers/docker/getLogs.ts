import { exec } from 'child_process'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { promisify } from 'util'
import parseLogLine from '#utils/containers/logs/parseLogLine.ts'
import normalizeText from '#utils/normalize.ts'
import sanitize from '#utils/sanitize.ts'
import config from '#config'
import { collectDockerLogsOverview } from '#utils/containers/logs/collectDockerLogsOverview.ts'

const execAsync = promisify(exec)

export type ParsedLogEntry = NonNullable<ReturnType<typeof parseLogLine>>

export type LogEntry = ParsedLogEntry & {
    fingerprint: string
}

type LogQuery = {
    service?: string
    container?: string
    search?: string
    level?: 'all' | 'error'
    tail?: string
}

export default async function getDockerLogs(req: FastifyRequest, res: FastifyReply) {
    const query = req.query as LogQuery
    const service = sanitize(query.service)
    const container = sanitize(query.container)
    const search = normalizeText(query.search).toLowerCase().trim()
    const level = query.level === 'all' ? 'all' : 'error'
    const tail = Number(query.tail) || config.docker.tail

    try {
        return res.send(await collectDockerLogsOverview({ container, level, search, service, tail }))
    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
