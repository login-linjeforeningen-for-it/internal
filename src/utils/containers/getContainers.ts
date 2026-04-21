import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const DOCKER_EXEC_OPTIONS = { maxBuffer: 12 * 1024 * 1024 }

type ContainerInfo = {
    id: string
    name: string
    status: string
    project: string
}

export default async function getContainers(): Promise<ContainerInfo[]> {
    const { stdout } = await execAsync(
        'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.Label \\"com.docker.compose.project\\"}}"',
        DOCKER_EXEC_OPTIONS
    )

    return stdout
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [id, name, status, project] = line.split('|')
            return { id, name, status, project: project || '' }
        })
}
