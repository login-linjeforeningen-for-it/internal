import config from '#config'
import type { LogEntry } from '../../handlers/docker/getLogs.ts'
import buildDiscordLogAlertPayload from './build.ts'

export default async function sendDiscordLogAlert(args: {
    checkedAt: string
    entry: LogEntry
    server: string
    source: CollectedLogSource
}) {
    if (!config.logs.alerts.enabled || !config.logs.alerts.webhook) {
        return
    }

    const url = new URL(config.logs.alerts.webhook)
    if (config.logs.alerts.threadId) {
        url.searchParams.set('thread_id', config.logs.alerts.threadId)
    }

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildDiscordLogAlertPayload(args)),
    })

    if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status} ${await response.text()}`)
    }
}
