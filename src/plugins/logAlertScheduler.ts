import type { FastifyInstance } from 'fastify'
import cron from 'node-cron'
import config from '#config'
import pruneSeenFingerprints, { seenFingerprints } from './pruneSeenFingerprints.ts'
import { collectDockerLogsOverview } from '#utils/containers/logs/collectDockerLogsOverview.ts'
import sendDiscordLogAlert from '#utils/alerts/discord.ts'

export default async function logAlertScheduler(fastify: FastifyInstance) {
    if (!config.logs.alerts.enabled || !config.logs.alerts.webhook) {
        fastify.log.info('Log alert scheduler disabled.')
        return
    }

    if (!cron.validate(config.logs.alerts.schedule)) {
        fastify.log.error(`Invalid log alert schedule: ${config.logs.alerts.schedule}. Log alerts not started.`)
        return
    }

    fastify.log.info(`Log alert scheduler started. Schedule: '${config.logs.alerts.schedule}'`)

    let primed = false

    cron.schedule(config.logs.alerts.schedule, async () => {
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

                await sendDiscordLogAlert({
                    checkedAt: overview.checkedAt,
                    entry: item.entry,
                    server: overview.server,
                    source: item.source,
                })
                seenFingerprints.set(item.entry.fingerprint, Date.now())
            }
        } catch (error) {
            fastify.log.error(error, 'Scheduled log alert dispatch failed.')
        }
    })
}
