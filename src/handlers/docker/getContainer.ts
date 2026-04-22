import { exec } from 'child_process'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { promisify } from 'util'
import { getDeploymentStatus } from '#utils/deploy/status.ts'

const execAsync = promisify(exec)
const DOCKER_EXEC_OPTIONS = { maxBuffer: 8 * 1024 * 1024 }
const DOCKER_LOG_TAIL = 500

function sanitizeDockerId(id: string) {
    return id.replace(/[^a-zA-Z0-9_.-]/g, '')
}

export default async function getDockerContainer(req: FastifyRequest, res: FastifyReply) {
    const { id } = req.params as { id: string }
    const safeId = sanitizeDockerId(id)

    if (!safeId) {
        return res.status(400).send({ error: 'Invalid container id' })
    }

    try {
        const { stdout } = await execAsync(
            `docker ps -a --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.RunningFor}}|{{.Label "com.docker.compose.project"}}"`,
            DOCKER_EXEC_OPTIONS
        )

        const { stdout: inspectOut } = await execAsync(`docker inspect ${safeId}`, DOCKER_EXEC_OPTIONS)
        const details = JSON.parse(inspectOut)[0]

        const { stdout: logsOut } = await execAsync(
            `docker logs --tail ${DOCKER_LOG_TAIL} ${safeId}`,
            DOCKER_EXEC_OPTIONS
        )
        const logs = logsOut.split('\n').filter(Boolean)
        const lines = stdout.split('\n').filter(Boolean)
        const containers = lines.map(line => {
            const [cid, name, status, uptime, project] = line.split('|')
            return { id: cid, name, status, uptime, project: project || '' }
        })

        const container = containers.find(c => c.id.startsWith(safeId))
        if (!container) {
            return res.status(404).send({ error: "Container not found" })
        }

        const service = container.name.includes('_') ? container.name.split('_')[0] : container.name

        const relatedContainers = containers
            .filter(c => c.name.startsWith(service))
            .sort((a, b) => a.name.localeCompare(b.name))
        const deployment = container.project ? await getDeploymentStatus(container.project) : null

        return res.send({
            service,
            deployment,
            container: { ...container, details, logs },
            related: relatedContainers
        })

    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
