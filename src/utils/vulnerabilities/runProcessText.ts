import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

type RunProcessTextOptions = {
    timeoutMs: number
    maxBuffer?: number
}

export default async function runProcessText(cmd: string[], options: RunProcessTextOptions) {
    const [command, ...args] = cmd
    if (!command) {
        throw new Error('Missing command')
    }

    const { stdout, stderr } = await execFileAsync(command, args, {
        encoding: 'utf8',
        maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
        timeout: options.timeoutMs,
        windowsHide: true,
    })

    return {
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
    }
}
