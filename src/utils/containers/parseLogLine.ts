import normalizeText from '#utils/normalize.ts'
import normalizeLevel from '../../handlers/docker/normalizeLevel'

export default function parseLogLine(line: string) {
    const trimmed = line.trim()
    if (!trimmed) {
        return null
    }

    try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>
        const level = normalizeLevel(parsed.level ?? parsed.severity)
        const message = normalizeText(parsed.msg ?? parsed.message ?? parsed.error ?? trimmed)
        const timestamp = normalizeText(parsed.time ?? parsed.timestamp)
        const isError = level === 'error' || /error|exception|failed|panic/i.test(message)

        return {
            raw: trimmed,
            message,
            level: level || (isError ? 'error' : 'info'),
            timestamp: timestamp || null,
            isError,
            structured: true
        }
    } catch {
        const isError = /error|exception|failed|panic/i.test(trimmed)
        return {
            raw: trimmed,
            message: trimmed,
            level: isError ? 'error' : 'info',
            timestamp: null,
            isError,
            structured: false
        }
    }
}
