import type { FastifyInstance } from 'fastify'
import { runBackup } from '../utils/backup/backup.ts'
import config from '#config'

export default async function backupScheduler(fastify: FastifyInstance) {
    const schedule = config.backup.schedule || '0 0 * * *'

    try { Bun.cron.parse(schedule) } catch {
        fastify.log.error(`Invalid cron schedule: ${schedule}. Backup scheduler not started.`)
        return
    }

    fastify.log.info(`Backup scheduler started. Schedule: '${schedule}'`)

    Bun.cron(schedule, async () => {
        fastify.log.info('Starting scheduled database backup...')
        try {
            const result = await runBackup()
            fastify.log.info(result, 'Database backup completed successfully.')
        } catch (err) {
            fastify.log.error(err, 'Database backup failed.')
        }
    })
}
