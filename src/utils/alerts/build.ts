import config from '#config'
import { buildLogsDeepLink } from '#utils/containers/logs/buildLogsDeepLink.ts'
import escapeCodeBlock from '#utils/containers/logs/escapeCodeBlock.ts'
import truncate from '#utils/containers/logs/truncate.ts'

export default function buildDiscordLogAlertPayload({
    checkedAt,
    entry,
    server,
    source,
}: {
    checkedAt: string
    entry: LogEntry
    server: string
    source: CollectedLogSource
}) {
    const logDetails = truncate(entry.raw || entry.message)
    const deepLink = buildLogsDeepLink(source.id, entry.fingerprint)

    return {
        embeds: [
            {
                author: {
                    name: 'Login Internal API',
                },
                title: `${source.name} reported an error`,
                url: deepLink,
                color: config.login.color,
                description: `\`\`\`log\n${escapeCodeBlock(logDetails)}\n\`\`\``,
                fields: [
                    { name: 'Server', value: server, inline: true },
                    { name: 'Service', value: source.service, inline: true },
                    { name: 'Source', value: source.name, inline: true },
                    { name: 'Status', value: source.status, inline: true },
                    { name: 'Level', value: entry.level, inline: true },
                    { name: 'Link', value: deepLink, inline: false },
                ],
                footer: {
                    text: `Fingerprint ${entry.fingerprint}`,
                },
                timestamp: entry.timestamp || checkedAt,
            }
        ]
    }
}
