import getContainers from '#utils/containers/getContainers.ts'
import parseLogLine from '#utils/containers/parseLogLine.ts'
import normalizeText from '#utils/normalize.ts'
import sanitize from '#utils/sanitize.ts'
import { exec } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)
const DOCKER_EXEC_OPTIONS = { maxBuffer: 12 * 1024 * 1024 }
const DEFAULT_TAIL = 200
const MAX_TAIL = 500

type ParsedLogEntry = NonNullable<ReturnType<typeof parseLogLine>>

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
            const entries = filterEntries(parseEntries(`${stdout}\n${stderr}`), { level, search }).slice(-50)

            return {
                id: item.id,
                name: item.name,
                service: item.project || item.name.split('_')[0] || item.name,
                status: item.status,
                matchedLines: entries.length,
                entries
            }
        }))

        const hostSources = await getHostLogSources({ tail, level, search })

        const nonEmpty = [...results, ...hostSources]
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

function parseEntries(raw: string) {
    return raw
        .split('\n')
        .map(parseLogLine)
        .filter((entry): entry is ParsedLogEntry => Boolean(entry))
}

function filterEntries(entries: ParsedLogEntry[], {
    level,
    search,
}: {
    level: 'all' | 'error'
    search: string
}) {
    return entries.filter(entry => {
        if (level === 'error' && !entry.isError) {
            return false
        }

        if (search && !entry.message.toLowerCase().includes(search) && !entry.raw.toLowerCase().includes(search)) {
            return false
        }

        return true
    })
}

async function safeExec(command: string) {
    try {
        const { stdout, stderr } = await execAsync(command, DOCKER_EXEC_OPTIONS)
        return `${stdout}\n${stderr}`.trim()
    } catch {
        return ''
    }
}

function readTailFile(path: string, tail: number) {
    try {
        if (!existsSync(path)) {
            return ''
        }

        const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
        return lines.slice(-tail).join('\n')
    } catch {
        return ''
    }
}

function getHistoryCandidates() {
    const home = homedir()
    return [
        join(home, '.zsh_history'),
        join(home, '.bash_history'),
        '/root/.bash_history',
        '/root/.zsh_history',
    ]
}

async function getHostLogSources({
    tail,
    level,
    search,
}: {
    tail: number
    level: 'all' | 'error'
    search: string
}) {
    const authLog = existsSync('/var/log/auth.log')
        ? readTailFile('/var/log/auth.log', tail)
        : readTailFile('/var/log/secure', tail)
    const syslog = existsSync('/var/log/syslog')
        ? readTailFile('/var/log/syslog', tail)
        : readTailFile('/var/log/messages', tail)
    const history = getHistoryCandidates()
        .map(path => readTailFile(path, Math.max(50, Math.floor(tail / 2))))
        .filter(Boolean)
        .join('\n')

    const journal = await safeExec(`journalctl -p err --since "24 hours ago" --no-pager -n ${tail} -o short-iso`)
    const sshJournal = await safeExec(`journalctl --since "7 days ago" --no-pager -n ${tail} -u ssh -u sshd -o short-iso`)

    const sources = [
        {
            id: 'host-journal',
            name: 'System journal',
            service: 'host',
            status: 'systemd',
            raw: journal,
        },
        {
            id: 'host-syslog',
            name: 'System log',
            service: 'host',
            status: 'file',
            raw: syslog,
        },
        {
            id: 'host-auth',
            name: 'Authentication log',
            service: 'ssh',
            status: 'file',
            raw: authLog,
        },
        {
            id: 'host-ssh-journal',
            name: 'SSH journal',
            service: 'ssh',
            status: 'systemd',
            raw: sshJournal,
        },
        {
            id: 'host-history',
            name: 'Shell history',
            service: 'shell',
            status: 'history',
            raw: history,
        },
    ]

    return sources.map(source => {
        const entries = filterEntries(parseEntries(source.raw), { level, search }).slice(-50)
        return {
            id: source.id,
            name: source.name,
            service: source.service,
            status: source.status,
            matchedLines: entries.length,
            entries,
        }
    })
}
