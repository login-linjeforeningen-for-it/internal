import getContainers from '#utils/containers/getContainers.ts'
import parseLogLine from '#utils/containers/parseLogLine.ts'
import normalizeText from '#utils/normalize.ts'
import sanitize from '#utils/sanitize.ts'
import { exec } from 'child_process'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { promisify } from 'util'

const execAsync = promisify(exec)
const DOCKER_EXEC_OPTIONS = { maxBuffer: 12 * 1024 * 1024 }
const DEFAULT_TAIL = 200
const MAX_TAIL = 500

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
    const tail = Math.min(Math.max(Number(query.tail) || DEFAULT_TAIL, 50), MAX_TAIL)

    try {
        const containers = await getContainers()
        const selected = containers.filter(item => {
            if (container && !item.id.startsWith(container) && item.name !== container) {
                return false
            }

            if (service && item.project !== service && !item.name.startsWith(`${service}_`)) {
                return false
            }

            return true
        })

        const results = await Promise.all(selected.map(async item => {
            const { stdout, stderr } = await execAsync(`docker logs --tail ${tail} ${item.id}`, DOCKER_EXEC_OPTIONS)
            const combined = `${stdout}\n${stderr}`
            const entries = combined
                .split('\n')
                .map(parseLogLine)
                .filter((entry): entry is NonNullable<ReturnType<typeof parseLogLine>> => Boolean(entry))
                .filter(entry => {
                    if (level === 'error' && !entry.isError) {
                        return false
                    }

                    if (search && !entry.message.toLowerCase().includes(search) && !entry.raw.toLowerCase().includes(search)) {
                        return false
                    }

                    return true
                })
                .slice(-50)

            return {
                id: item.id,
                name: item.name,
                service: item.project || item.name.split('_')[0] || item.name,
                status: item.status,
                matchedLines: entries.length,
                entries
            }
        }))

        const nonEmpty = results
            .filter(item => item.matchedLines > 0 || container)
            .sort((left, right) => right.matchedLines - left.matchedLines || left.name.localeCompare(right.name))

        return res.send({
            server: process.env.SERVER_NAME || process.env.HOSTNAME || 'local',
            checkedAt: new Date().toISOString(),
            filters: { service, container, search, level, tail },
            totalContainers: selected.length,
            containers: nonEmpty
        })
    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
