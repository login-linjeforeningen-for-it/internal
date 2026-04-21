type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type JsonLogEntry = {
    time: string
    level: LogLevel
    service: string
    runtime: 'api'
    environment: string
    pid: number
    hostname: string
    msg: string
    origin?: {
        file?: string
        line?: number
        column?: number
        function?: string
    }
    err?: {
        name: string
        message: string
        stack?: string
        code?: string | number
        cause?: unknown
    }
    context?: Record<string, unknown>
    data?: unknown[]
}

const REDACTED_KEYS = [
    'authorization',
    'cookie',
    'password',
    'secret',
    'token',
    'client_secret',
    'access_token',
    'refresh_token',
    'api_key',
]

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactValue)
    }

    if (!isRecord(value)) {
        return value
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, innerValue]) => {
            const shouldRedact = REDACTED_KEYS.some((redactedKey) =>
                key.toLowerCase().includes(redactedKey)
            )

            if (shouldRedact) {
                return [key, '[REDACTED]']
            }

            return [key, redactValue(innerValue)]
        })
    )
}

function serializeError(error: Error & { code?: string | number, cause?: unknown }) {
    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        cause: redactValue(error.cause),
    }
}

function normalizeArgs(args: unknown[]) {
    let msg = ''
    let err: JsonLogEntry['err']
    let context: Record<string, unknown> | undefined
    const data: unknown[] = []

    for (const arg of args) {
        if (typeof arg === 'string') {
            msg = msg ? `${msg} ${arg}` : arg
            continue
        }

        if (arg instanceof Error) {
            err = serializeError(arg as Error & { code?: string | number, cause?: unknown })
            if (!msg) {
                msg = arg.message
            }
            continue
        }

        if (isRecord(arg) && !context) {
            context = redactValue(arg) as Record<string, unknown>
            continue
        }

        data.push(redactValue(arg))
    }

    return {
        msg: msg || 'Log entry',
        err,
        context,
        data: data.length > 0 ? data : undefined,
    }
}

function getOrigin() {
    const stack = new Error().stack?.split('\n').slice(2) ?? []
    const frame = stack.find((line) =>
        !line.includes('jsonLogger.ts')
        && !line.includes('node:internal')
        && !line.includes('pino')
        && !line.includes('<anonymous>')
    )

    if (!frame) {
        return undefined
    }

    const match = frame.match(/at (?:(.+?) )?\(?(.+):(\d+):(\d+)\)?$/)

    if (!match) {
        return undefined
    }

    return {
        function: match[1],
        file: match[2],
        line: Number(match[3]),
        column: Number(match[4]),
    }
}

function write(entry: JsonLogEntry) {
    process.stdout.write(`${JSON.stringify(entry)}\n`)
}

export function log(level: LogLevel, msg: string, context?: Record<string, unknown>) {
    write({
        time: new Date().toISOString(),
        level,
        service: 'internal_api',
        runtime: 'api',
        environment: process.env.NODE_ENV ?? 'development',
        pid: process.pid,
        hostname: process.env.HOSTNAME ?? 'unknown',
        msg,
        context: context ? redactValue(context) as Record<string, unknown> : undefined,
        origin: getOrigin(),
    })
}

export function installJsonConsoleLogger() {
    if ((globalThis as { __internalJsonConsoleInstalled?: boolean }).__internalJsonConsoleInstalled) {
        return
    }

    ;(globalThis as { __internalJsonConsoleInstalled?: boolean }).__internalJsonConsoleInstalled = true

    const methods: Array<{ consoleMethod: 'log' | 'info' | 'warn' | 'error', level: LogLevel }> = [
        { consoleMethod: 'log', level: 'info' },
        { consoleMethod: 'info', level: 'info' },
        { consoleMethod: 'warn', level: 'warn' },
        { consoleMethod: 'error', level: 'error' },
    ]

    for (const { consoleMethod, level } of methods) {
        console[consoleMethod] = (...args: unknown[]) => {
            const normalized = normalizeArgs(args)
            write({
                time: new Date().toISOString(),
                level,
                service: 'internal_api',
                runtime: 'api',
                environment: process.env.NODE_ENV ?? 'development',
                pid: process.pid,
                hostname: process.env.HOSTNAME ?? 'unknown',
                msg: normalized.msg,
                err: normalized.err,
                context: normalized.context,
                data: normalized.data,
                origin: getOrigin(),
            })
        }
    }
}
