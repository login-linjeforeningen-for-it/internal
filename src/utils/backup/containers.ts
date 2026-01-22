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
    let psCmd = 'docker ps -q'
    if (options.all || options.filterId || options.filterProject) {
        psCmd += ' -a'
    }
    
    if (options.filterId) {
        psCmd += ` --filter "id=${options.filterId}"`
    }
    if (options.filterProject) {
        psCmd += ` --filter "label=com.docker.compose.project=${options.filterProject}"`
    }
    if (!options.filterId && !options.filterProject && !options.all) {
        psCmd += ' --filter "label=com.docker.compose.project"'
    }

    const cmd = `docker inspect $(${psCmd}) --format '{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.State.Status}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`

    const { stdout } = await execAsync(cmd)

    return stdout.split('\n')
        .filter(l => l.trim() !== '')
        .map(line => {
            const [id, name, image, status, project, workingDir] = line.split('|')
            return { 
                id: id.substring(0, 12),
                name: name.startsWith('/') ? name.substring(1) : name,
                image,
                project: project || '',
                workingDir: workingDir || '',
                status
            }
        })
        .filter(c => c.image.toLowerCase().includes('postgres'))
}