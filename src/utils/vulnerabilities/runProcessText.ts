declare const Bun: {
    spawn: (options: {
        cmd: string[]
        stdout: 'pipe'
        stderr: 'pipe'
    }) => {
        stdout: ReadableStream<Uint8Array>
        stderr: ReadableStream<Uint8Array>
        exited: Promise<number>
        kill: (signal?: string) => void
    }
}

type RunProcessTextOptions = {
    timeoutMs: number
    maxBuffer?: number
}

export default async function runProcessText(cmd: string[], options: RunProcessTextOptions) {
    const process = Bun.spawn({
        cmd,
        stdout: 'pipe',
        stderr: 'pipe',
    })

    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            timedOut = true
            process.kill('SIGKILL')
            const error = new Error(`Command timed out after ${options.timeoutMs}ms`) as Error & {
                code?: number
                killed?: boolean
            }
            error.code = 124
            error.killed = true
            reject(error)
        }, options.timeoutMs)
    })

    const resultPromise = Promise.all([
        readStream(process.stdout, options.maxBuffer),
        readStream(process.stderr, options.maxBuffer),
        process.exited,
    ])

    const [stdout, stderr, exitCode] = await Promise.race([
        resultPromise,
        timeoutPromise,
    ]).finally(() => {
        if (timeout) clearTimeout(timeout)
        if (timedOut) {
            process.kill('SIGKILL')
        }
    })

    if (exitCode !== 0) {
        const error = new Error(stderr || stdout || `Command failed with exit code ${exitCode}`) as Error & {
            stdout?: string
            stderr?: string
            code?: number
            killed?: boolean
        }
        error.stdout = stdout
        error.stderr = stderr
        error.code = exitCode
        error.killed = exitCode === 137
        throw error
    }

    return { stdout, stderr }
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
            reader.cancel().catch(() => undefined)
            throw new Error(`Command output exceeded ${maxBuffer} bytes`)
        }
        chunks.push(value)
    }

    return new TextDecoder().decode(Buffer.concat(chunks))
}
