import getContainers from '#utils/containers/getContainers.ts'
import finalizeEntries from '#utils/containers/logs/finalizeEntries.ts'
import getHostLogSources from '#utils/containers/logs/getHostLogSources.ts'
import config from '#config'
import filterEntries from '#utils/containers/logs/filterEntries.ts'
import parseEntries from '#utils/containers/logs/parseEntries.ts'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function collectDockerLogsOverview({
    container = '',
    level = 'error',
    search = '',
    service = '',
    tail = config.docker.tail,
}: {
    container?: string
    level?: 'all' | 'error'
    search?: string
    service?: string
    tail?: number
}): Promise<CollectedLogsOverview> {
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
        const { stdout, stderr } = await execAsync(`docker logs --tail ${tail} ${item.id}`, config.docker.options)
        const entries = finalizeEntries(
            filterEntries(parseEntries(`${stdout}\n${stderr}`), { level, search }).slice(-50),
            item.id
        )

        return {
            id: item.id,
            name: item.name,
            service: item.project || item.name.split('_')[0] || item.name,
            status: item.status,
            sourceType: 'container' as const,
            matchedLines: entries.length,
            entries
        }
    }))

    const hostSources = await getHostLogSources({ tail, level, search })

    const nonEmpty = [...results, ...hostSources]
        .filter(item => item.matchedLines > 0 || container)
        .sort((left, right) => right.matchedLines - left.matchedLines || left.name.localeCompare(right.name))

    return {
        server: process.env.SERVER_NAME || process.env.HOSTNAME || 'local',
        checkedAt: new Date().toISOString(),
        filters: { service, container, search, level, tail },
        totalContainers: selected.length,
        containers: nonEmpty
    }
}
