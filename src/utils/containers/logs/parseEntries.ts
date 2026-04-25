import parseLogLine from './parseLogLine'

export default function parseEntries(raw: string) {
    return raw
        .split('\n')
        .map(parseLogLine)
        .filter((entry): entry is ParsedLogEntry => Boolean(entry))
}
