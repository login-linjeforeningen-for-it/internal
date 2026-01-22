import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type PostgresContainer = {
    id: string
    name: string
    image: string
    project: string
    workingDir: string
    status: string
}

export default async function getPostgresContainers(options: { all?: boolean, filterId?: string, filterProject?: string } = {}): Promise<PostgresContainer[]> {
    let cmd = 'docker ps --format \'{{.ID}}|{{.Names}}|{{.Status}}|{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.project.working_dir"}}\''
    if (options.all) {
        cmd += ' -a'
    }
    if (options.filterId) {
        cmd += ` --filter "id=${options.filterId}"`
    }
    if (options.filterProject) {
        cmd += ` --filter "label=com.docker.compose.project=${options.filterProject}"`
    }
    if (!options.filterId && !options.filterProject && !options.all) {
        cmd += ' --filter "label=com.docker.compose.project"'
    }

    const { stdout } = await execAsync(cmd)
    const lines = stdout.split('\n').filter(l => l.trim() !== '')
    const ids = lines.map(line => line.split('|')[0])
    const imageCmd = `docker inspect ${ids.join(' ')} --format '{{.Config.Image}}'`
    const { stdout: imageStdout } = await execAsync(imageCmd)
    const images = imageStdout.split('\n').filter(l => l.trim() !== '')

    return lines.map((line, i) => {
        const [id, name, status, project, workingDir] = line.split('|')
        return { 
            id: id.substring(0, 12),
            name: name.startsWith('/') ? name.substring(1) : name,
            image: images[i],
            project: project || '',
            workingDir: workingDir || '',
            status
        }
    }).filter(c => c.image.toLowerCase().includes('postgres'))
}