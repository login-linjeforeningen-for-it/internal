export default function firstLine(value: unknown): string {
    if (typeof value !== 'string') {
        return ''
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed.split('\n')[0] : ''
}
