export default function parsePostgresTimestamp(value: string, timezone: string) {
    const parsed = new Date(`${value} ${timezone}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
