import type { FastifyInstance } from 'fastify'
import cron from 'node-cron'
import { runBackup } from '../utils/backup/backup.ts'
import config from '#config'

export default async function backupScheduler(fastify: FastifyInstance) {
    const schedule = config.backup.schedule || '0 0 * * *'

    if (!cron.validate(schedule)) {
        fastify.log.error(`Invalid cron schedule: ${schedule}. Backup scheduler not started.`)
        return
    }

    fastify.log.info(`Backup scheduler started. Schedule: '${schedule}'`)

    cron.schedule(schedule, async () => {
        fastify.log.info('Starting scheduled database backup...')
        try {
            const result = await runBackup()
            fastify.log.info(result, 'Database backup completed successfully.')
        } catch (err) {
            fastify.log.error(err, 'Database backup failed.')
        }
    })
}
