import config from '#config'

export function buildLogsDeepLink(sourceId: string, fingerprint: string) {
    return `${config.queenbee.url}/internal/logs#${encodeURIComponent(sourceId)}?entry=${encodeURIComponent(fingerprint)}`
}
