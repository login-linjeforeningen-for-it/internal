export default function isDockerScoutIndexingNotice(value: unknown) {
    const text = String(
        (value as any)?.stderr
        || (value as any)?.stdout
        || (value as any)?.message
        || value
        || ''
    ).toLowerCase()

    return text.includes('storing image for indexing')
}
