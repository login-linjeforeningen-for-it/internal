import type { FastifyReply, FastifyRequest } from 'fastify'
import { runBackup } from '#utils/backup/backup.ts'

let backupInFlight: Promise<void> | null = null

export default async function triggerBackup(req: FastifyRequest, res: FastifyReply) {
    if (backupInFlight) {
        return res.status(202).send({
            message: 'Backup already running',
            status: 'running',
        })
    }

    backupInFlight = runBackup()
        .then((result) => {
            req.log.info(result, 'Manual database backup completed successfully.')
        })
        .catch((error) => {
            req.log.error(error, 'Manual database backup failed.')
        })
        .finally(() => {
            backupInFlight = null
        })

    return res.status(202).send({
        message: 'Backup started',
        status: 'running',
    })
}
