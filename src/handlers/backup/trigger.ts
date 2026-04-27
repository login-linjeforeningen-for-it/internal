import type { FastifyReply, FastifyRequest } from 'fastify'
import { runBackup } from '#utils/backup/backup.ts'

export default async function triggerBackup(_: FastifyRequest, res: FastifyReply) {
    try {
        const result = await runBackup()
        res.send({
            message: `Backup completed for ${result.backedUp}/${result.discovered} database containers`,
            ...result,
        })
    } catch (e: any) {
        res.status(500).send({ error: e.message })
    }
}
