import { LogEntry, ParsedLogEntry } from '#handlers/docker/getLogs.ts'
import createFingerprint from './createFingerprint'

export default function finalizeEntries(entries: ParsedLogEntry[], sourceId: string): LogEntry[] {
    return entries.map(entry => ({
        ...entry,
        fingerprint: createFingerprint(sourceId, entry)
    }))
}
