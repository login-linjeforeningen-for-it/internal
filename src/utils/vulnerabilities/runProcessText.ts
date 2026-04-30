type RunProcessTextOptions = {
    timeoutMs: number
    maxBuffer?: number
}

export default async function runProcessText(cmd: string[], options: RunProcessTextOptions) {
    const child = Bun.spawn({ cmd, stdout: 'pipe', stderr: 'pipe' })
    let timedOut = false
    const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }, options.timeoutMs)

    try {
        const [stdout, stderr, exitCode] = await Promise.all([
            readStream(child.stdout, options.maxBuffer),
            readStream(child.stderr, options.maxBuffer),
            child.exited,
        ])
        return processResult(exitCode, stdout, stderr, timedOut, options.timeoutMs)
    } finally {
        clearTimeout(timeout)
    }
}

async function readStream(stream: ReadableStream<Uint8Array>, maxBuffer = 20 * 1024 * 1024) {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let size = 0

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBuffer) {
            await reader.cancel().catch(() => undefined)
            throw createProcessError(`Command output exceeded ${maxBuffer} bytes`, '', '', null, true)
        }
        chunks.push(value)
    }

    return new TextDecoder().decode(Buffer.concat(chunks))
}

function processResult(exitCode: number, stdout: string, stderr: string, timedOut: boolean, timeoutMs: number) {
    if (timedOut) {
        throw createProcessError(`Command timed out after ${timeoutMs}ms`, stdout, stderr, exitCode, true)
    }

    if (exitCode !== 0) {
        const message = stderr || stdout || `Command failed with exit code ${exitCode}`
        throw createProcessError(message, stdout, stderr, exitCode, false)
    }

    return { stdout, stderr }
}

function createProcessError(message: string, stdout: string, stderr: string, code: number | null, killed: boolean) {
    const error = new Error(message) as Error & {
        stdout?: string
        stderr?: string
        code?: number | null
        killed?: boolean
    }
    error.stdout = stdout
    error.stderr = stderr
    error.code = code
    error.killed = killed
    return error
}
