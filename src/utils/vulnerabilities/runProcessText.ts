import { spawn } from 'child_process'

type RunProcessTextOptions = {
    timeoutMs: number
    maxBuffer?: number
}

export default async function runProcessText(cmd: string[], options: RunProcessTextOptions) {
    const [command, ...args] = cmd
    if (!command) {
        throw new Error('Missing command')
    }

    return new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
        const maxBuffer = options.maxBuffer || 20 * 1024 * 1024
        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        })
        const output = createOutputCollector(maxBuffer, (error) => {
            child.kill('SIGTERM')
            reject(error)
        })
        let timedOut = false

        const timer = setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
            setTimeout(() => child.kill('SIGKILL'), 2000).unref()
        }, options.timeoutMs)

        child.stdout?.on('data', (chunk) => output.appendStdout(chunk))
        child.stderr?.on('data', (chunk) => output.appendStderr(chunk))
        child.on('error', (error) => {
            clearTimeout(timer)
            reject(error)
        })
        child.on('close', (code) => {
            clearTimeout(timer)
            if (timedOut) {
                reject(createProcessError(`Command timed out after ${options.timeoutMs}ms`, output))
                return
            }
            if (code && code !== 0) {
                reject(createProcessError(`Command failed with exit code ${code}`, output))
                return
            }
            resolve({ stdout: output.stdout(), stderr: output.stderr() })
        })
    })
}

function createOutputCollector(maxBuffer: number, onError: (error: Error) => void) {
    let stdout = ''
    let stderr = ''
    let rejected = false

    const append = (value: string, current: string) => {
        if (rejected) return current
        const next = current + value
        if (next.length > maxBuffer) {
            rejected = true
            onError(new Error(`Command output exceeded ${maxBuffer} bytes`))
        }
        return next
    }

    return {
        appendStdout(chunk: Buffer) {
            const value = chunk.toString('utf8')
            const next = append(value, stdout)
            stdout = next

            return stdout
        },
        appendStderr(chunk: Buffer) {
            const value = chunk.toString('utf8')
            const next = append(value, stderr)
            stderr = next

            return stderr
        },
        stdout() {
            const value = stdout
            if (!value) {
                return ''
            }

            return value
        },
        stderr() {
            const value = stderr
            if (!value) {
                return ''
            }

            return value
        },
    }
}

function createProcessError(message: string, output: { stdout: () => string, stderr: () => string }) {
    const error = new Error(message) as Error & { stdout?: string, stderr?: string }
    error.stdout = output.stdout()
    error.stderr = output.stderr()

    return error
}
