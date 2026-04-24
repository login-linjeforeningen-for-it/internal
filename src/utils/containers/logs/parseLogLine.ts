import normalizeText from '#utils/normalize.ts'
import normalizeLevel from '../../../handlers/docker/normalizeLevel'
import inferIsError from './inferIserror'
import inferLevel from './inferLevel'
import normalizeTimestamp from './normalizeTimestamp'
import parseCurrentYearTimestamp from './parseCurrentYearTimestamp'
import parsePostgresTimestamp from './parsePostgresTimestamp'
import parseSlashTimestamp from './parseSlashTimestamp'

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
        const isError = level === 'error' || inferIsError(message, trimmed)

        return {
            raw: trimmed,
            message,
            level: level || (isError ? 'error' : 'info'),
            timestamp: timestamp ? normalizeTimestamp(timestamp) || timestamp : null,
            isError,
            structured: true
        }
    } catch {
        const nginxMatch = trimmed.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[([^\]]+)\] \d+#\d+: (.*)$/)
        if (nginxMatch) {
            const [, rawTimestamp, rawLevel, message] = nginxMatch
            const level = inferLevel(message, rawLevel)
            const isError = level === 'error' || inferIsError(message, trimmed)

            return {
                raw: trimmed,
                message,
                level: level || (isError ? 'error' : 'info'),
                timestamp: parseSlashTimestamp(rawTimestamp),
                isError,
                structured: false
            }
        }

        const journalMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+\S+\s+([^:]+):\s*(.*)$/)
        if (journalMatch) {
            const [, rawTimestamp, source, message] = journalMatch
            const level = inferLevel(message, source)
            const isError = level === 'error' || inferIsError(message, trimmed)

            return {
                raw: trimmed,
                message,
                level: level || (isError ? 'error' : 'info'),
                timestamp: normalizeTimestamp(rawTimestamp),
                isError,
                structured: false
            }
        }

        const postgresMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+([A-Z]{2,5})\s+\[\d+\]\s+([A-Z]+):\s+(.*)$/)
        if (postgresMatch) {
            const [, rawTimestamp, timezone, rawLevel, message] = postgresMatch
            const level = inferLevel(message, rawLevel)
            const isError = level === 'error' || inferIsError(message, trimmed)

            return {
                raw: trimmed,
                message,
                level: level || (isError ? 'error' : 'info'),
                timestamp: parsePostgresTimestamp(rawTimestamp, timezone),
                isError,
                structured: false
            }
        }

        const syslogMatch = trimmed.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s+\S+\s+([^:]+):\s*(.*)$/)
        if (syslogMatch) {
            const [, rawTimestamp, source, message] = syslogMatch
            const level = inferLevel(message, source)
            const isError = level === 'error' || inferIsError(message, trimmed)

            return {
                raw: trimmed,
                message,
                level: level || (isError ? 'error' : 'info'),
                timestamp: parseCurrentYearTimestamp(rawTimestamp),
                isError,
                structured: false
            }
        }

        const historyMatch = trimmed.match(/^: (\d+):\d+;(.*)$/)
        if (historyMatch) {
            const [, rawTimestamp, message] = historyMatch
            const timestamp = Number(rawTimestamp)
            const parsedTimestamp = Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null
            const isError = inferIsError(message, trimmed)

            return {
                raw: trimmed,
                message,
                level: isError ? 'error' : 'info',
                timestamp: parsedTimestamp,
                isError,
                structured: false
            }
        }

        const isError = inferIsError(trimmed, trimmed)
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
