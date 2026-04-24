export default function normalizeTimestamp(value: string) {
    const compactOffset = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    const parsed = new Date(compactOffset)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
