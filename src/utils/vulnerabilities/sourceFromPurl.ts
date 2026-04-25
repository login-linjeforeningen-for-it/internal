import normalizeSourceLabel from './normalizeSourceLabel.ts'

export default function sourceFromPurl(purl: string): string {
    const match = /^pkg:([^/]+)/i.exec(purl.trim())
    if (!match) {
        return 'unknown'
    }

    const packageType = normalizeSourceLabel(match[1])
    return `dependency:${packageType}`
}
