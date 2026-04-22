import { exec } from 'child_process'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { promisify } from 'util'
import { getDeploymentStatus } from '#utils/deploy/status.ts'

const execAsync = promisify(exec)

export default async function getDockerContainers(_: FastifyRequest, res: FastifyReply) {
    try {
        const { stdout } = await execAsync(`docker ps -a --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.Label \"com.docker.compose.project\"}}"`)
        const lines = stdout.split('\n').filter(Boolean)
        const projects = [...new Set(lines.map(line => line.split('|')[3]).filter(Boolean))]
        const deploymentStatuses = new Map<string, NonNullable<Awaited<ReturnType<typeof getDeploymentStatus>>>>()
        for (const project of projects) {
            const status = await getDeploymentStatus(project)
            if (status) {
                deploymentStatuses.set(project, status)
            }
        }

        const containers = lines.map(line => {
            const [id, name, status, project] = line.split('|')
            return {
                id,
                name,
                status,
                project: project || '',
                deployment: project ? deploymentStatuses.get(project) || null : null
            }
        }).sort((a, b) => a.name.localeCompare(b.name))

        res.send({ status: containers.length > 0 ? 'available' : 'unavailable', count: containers.length, containers })
    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
