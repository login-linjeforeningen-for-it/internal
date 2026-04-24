export default function parseSlashTimestamp(value: string) {
    const parsed = new Date(value.replace(/\//g, '-').replace(' ', 'T'))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
