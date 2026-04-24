export default function parseCurrentYearTimestamp(value: string) {
    const parsed = new Date(`${new Date().getFullYear()} ${value}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
