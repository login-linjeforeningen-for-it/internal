import type { FastifyReply, FastifyRequest } from 'fastify'
import { runBackup } from '#utils/backup/backup.ts'

export default async function triggerBackup(_: FastifyRequest, res: FastifyReply) {
    try {
        await runBackup()
        res.send({ message: 'Backup triggered successfully' })
    } catch (e: any) {
        res.status(500).send({ error: e.message })
    }
}