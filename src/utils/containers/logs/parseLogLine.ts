import normalizeText from '#utils/normalize.ts'
import normalizeLevel from '../../../handlers/docker/normalizeLevel'
import inferIsError from './inferIserror'
import inferLevel from './inferLevel'
import normalizeTimestamp from './normalizeTimestamp'
import parseCurrentYearTimestamp from './parseCurrentYearTimestamp'
import parsePostgresTimestamp from './parsePostgresTimestamp'
import parseSlashTimestamp from './parseSlashTimestamp'

function isBenignOperationalNoise(message: string, raw: string) {
    return /Failed to find Server Action "[a-f0-9]+"/i.test(message)
        || /Failed to find Server Action "[a-f0-9]+"/i.test(raw)
}

function parseHttpAccessStatus(raw: string) {
    const match = raw.match(/^\S+ \S+ \S+ \[([^\]]+)\] "(?:[^"\\]|\\.)*" (\d{3})\b/)
    if (!match) {
        return null
    }

    return {
        rawTimestamp: match[1],
        status: Number(match[2])
    }
}

function parseHttpAccessTimestamp(rawTimestamp: string) {
    const match = rawTimestamp.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/)
    if (!match) {
        return null
    }

    const [, day, month, year, hour, minute, second, offset] = match
    const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        .findIndex(value => value.toLowerCase() === month.toLowerCase())

    if (monthIndex < 0) {
        return null
    }

    const normalizedOffset = `${offset.slice(0, 3)}:${offset.slice(3)}`
    return normalizeTimestamp(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${day}T${hour}:${minute}:${second}${normalizedOffset}`)
}

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
        const benign = isBenignOperationalNoise(message, trimmed)
        const isError = !benign && (level === 'error' || inferIsError(message, trimmed))

        return {
            raw: trimmed,
            message,
            level: benign ? 'info' : level || (isError ? 'error' : 'info'),
            timestamp: timestamp ? normalizeTimestamp(timestamp) || timestamp : null,
            isError,
            structured: true
        }
    } catch {
        const accessMatch = parseHttpAccessStatus(trimmed)
        if (accessMatch) {
            const isError = accessMatch.status >= 500
            return {
                raw: trimmed,
                message: trimmed,
                level: isError ? 'error' : 'info',
                timestamp: parseHttpAccessTimestamp(accessMatch.rawTimestamp),
                isError,
                structured: false
            }
        }

        const nginxMatch = trimmed.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[([^\]]+)\] \d+#\d+: (.*)$/)
        if (nginxMatch) {
            const [, rawTimestamp, rawLevel, message] = nginxMatch
            const level = inferLevel(message, rawLevel)
            const benign = isBenignOperationalNoise(message, trimmed)
            const isError = !benign && (level === 'error' || inferIsError(message, trimmed))

            return {
                raw: trimmed,
                message,
                level: benign ? 'info' : level || (isError ? 'error' : 'info'),
                timestamp: parseSlashTimestamp(rawTimestamp),
                isError,
                structured: false
            }
        }

        const journalMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+\S+\s+([^:]+):\s*(.*)$/)
        if (journalMatch) {
            const [, rawTimestamp, source, message] = journalMatch
            const level = inferLevel(message, source)
            const benign = isBenignOperationalNoise(message, trimmed)
            const isError = !benign && (level === 'error' || inferIsError(message, trimmed))

            return {
                raw: trimmed,
                message,
                level: benign ? 'info' : level || (isError ? 'error' : 'info'),
                timestamp: normalizeTimestamp(rawTimestamp),
                isError,
                structured: false
            }
        }

        const postgresMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+([A-Z]{2,5})\s+\[\d+\]\s+([A-Z]+):\s+(.*)$/)
        if (postgresMatch) {
            const [, rawTimestamp, timezone, rawLevel, message] = postgresMatch
            const level = inferLevel(message, rawLevel)
            const benign = isBenignOperationalNoise(message, trimmed)
            const isError = !benign && (level === 'error' || inferIsError(message, trimmed))

            return {
                raw: trimmed,
                message,
                level: benign ? 'info' : level || (isError ? 'error' : 'info'),
                timestamp: parsePostgresTimestamp(rawTimestamp, timezone),
                isError,
                structured: false
            }
        }

        const syslogMatch = trimmed.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s+\S+\s+([^:]+):\s*(.*)$/)
        if (syslogMatch) {
            const [, rawTimestamp, source, message] = syslogMatch
            const level = inferLevel(message, source)
            const benign = isBenignOperationalNoise(message, trimmed)
            const isError = !benign && (level === 'error' || inferIsError(message, trimmed))

            return {
                raw: trimmed,
                message,
                level: benign ? 'info' : level || (isError ? 'error' : 'info'),
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
            const benign = isBenignOperationalNoise(message, trimmed)
            const isError = !benign && inferIsError(message, trimmed)

            return {
                raw: trimmed,
                message,
                level: benign ? 'info' : isError ? 'error' : 'info',
                timestamp: parsedTimestamp,
                isError,
                structured: false
            }
        }

        const benign = isBenignOperationalNoise(trimmed, trimmed)
        const isError = !benign && inferIsError(trimmed, trimmed)
        return {
            raw: trimmed,
            message: trimmed,
            level: benign ? 'info' : isError ? 'error' : 'info',
            timestamp: null,
            isError,
            structured: false
        }
    }
}
