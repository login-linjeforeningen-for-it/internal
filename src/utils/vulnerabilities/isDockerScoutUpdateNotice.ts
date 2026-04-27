export default function isDockerScoutUpdateNotice(value: unknown) {
    const text = String(
        (value as any)?.stderr
        || (value as any)?.stdout
        || (value as any)?.message
        || value
        || ''
    ).toLowerCase()

    return text.includes('new version')
        && text.includes('docker scout')
        && text.includes('available')
}
