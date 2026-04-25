import createFingerprint from './createFingerprint'

export default function finalizeEntries(entries: ParsedLogEntry[], sourceId: string): LogEntry[] {
    return entries.map(entry => ({
        ...entry,
        fingerprint: createFingerprint(sourceId, entry)
    }))
}
