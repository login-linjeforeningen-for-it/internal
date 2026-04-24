import config from '#config'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default async function safeExec(command: string) {
    try {
        const { stdout, stderr } = await execAsync(command, config.docker.options)
        return `${stdout}\n${stderr}`.trim()
    } catch {
        return ''
    }
}
