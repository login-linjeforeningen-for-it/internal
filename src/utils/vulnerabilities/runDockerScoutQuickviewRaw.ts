import { exec } from 'child_process'
import { promisify } from 'util'
import shellEscape from './shellEscape.ts'

const execAsync = promisify(exec)

export default async function runDockerScoutQuickviewRaw(image: string) {
    const command = `docker scout quickview ${shellEscape(image)} 2>&1`
    const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 })
    return String(stdout)
}
