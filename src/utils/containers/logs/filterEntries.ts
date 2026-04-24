import { ParsedLogEntry } from '#handlers/docker/getLogs.ts'

export default function filterEntries(entries: ParsedLogEntry[], {
    level,
    search,
}: {
    level: 'all' | 'error'
    search: string
}) {
    return entries.filter(entry => {
        if (level === 'error' && !entry.isError) {
            return false
        }

        if (search && !entry.message.toLowerCase().includes(search) && !entry.raw.toLowerCase().includes(search)) {
            return false
        }

        return true
    })
}
