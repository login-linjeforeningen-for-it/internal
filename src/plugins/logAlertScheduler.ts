import type { FastifyInstance } from 'fastify'
import config from '#config'
import pruneSeenFingerprints, { seenFingerprints } from './pruneSeenFingerprints.ts'
import { collectDockerLogsOverview } from '#utils/containers/logs/collectDockerLogsOverview.ts'
import { discordAlert } from 'utilbee/utils'
import { buildLogsDeepLink } from '#utils/containers/logs/buildLogsDeepLink.ts'
import escapeCodeBlock from '#utils/containers/logs/escapeCodeBlock.ts'
import truncate from '#utils/containers/logs/truncate.ts'

export default async function logAlertScheduler(fastify: FastifyInstance) {
    if (!config.logs.alerts.enabled || !config.logs.alerts.webhook) {
        fastify.log.info('Log alert scheduler disabled.')
        return
    }

    try { Bun.cron.parse(config.logs.alerts.schedule) } catch {
        fastify.log.error(`Invalid log alert schedule: ${config.logs.alerts.schedule}. Log alerts not started.`)
        return
    }

    fastify.log.info(`Log alert scheduler started. Schedule: '${config.logs.alerts.schedule}'`)

    let primed = false

    Bun.cron(config.logs.alerts.schedule, async () => {
        try {
            pruneSeenFingerprints()
            const overview = await collectDockerLogsOverview({ level: 'error', tail: 200 })
            const pending = overview.containers.flatMap(source =>
                source.entries.map(entry => ({ entry, source }))
            )

            if (!primed) {
                pending.forEach(({ entry }) => {
                    seenFingerprints.set(entry.fingerprint, Date.now())
                })
                primed = true
                return
            }

            for (const item of pending) {
                if (seenFingerprints.has(item.entry.fingerprint)) {
                    continue
                }

                const logDetails = truncate(item.entry.raw || item.entry.message)
                const deepLink = buildLogsDeepLink(item.source.id, item.entry.fingerprint)

                await discordAlert({
                    webhookURL: config.logs.alerts.webhook!,
                    threadId: config.logs.alerts.threadId,
                    title: `${item.source.name} reported an error`,
                    url: deepLink,
                    color: config.login.color,
                    description: `\`\`\`log\n${escapeCodeBlock(logDetails)}\n\`\`\``,
                    fields: [
                        { name: 'Server', value: overview.server, inline: true },
                        { name: 'Service', value: item.source.service, inline: true },
                        { name: 'Source', value: item.source.name, inline: true },
                        { name: 'Status', value: item.source.status, inline: true },
                        { name: 'Level', value: item.entry.level, inline: true },
                        { name: 'Link', value: deepLink, inline: false },
                    ],
                    footer: `Fingerprint ${item.entry.fingerprint}`,
                    timestamp: item.entry.timestamp || overview.checkedAt,
                })
                seenFingerprints.set(item.entry.fingerprint, Date.now())
            }
        } catch (error) {
            fastify.log.error(error, 'Scheduled log alert dispatch failed.')
        }
    })
}
