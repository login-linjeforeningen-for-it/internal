import { ParsedLogEntry } from '#handlers/docker/getLogs.ts'
import { createHash } from 'crypto'

export default function createFingerprint(sourceId: string, entry: ParsedLogEntry) {
    return createHash('sha1')
        .update([sourceId, entry.timestamp || '', entry.level, entry.message, entry.raw].join('::'))
        .digest('hex')
        .slice(0, 16)
}
