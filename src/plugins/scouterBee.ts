import type { FastifyInstance } from 'fastify'
import { runProjectScout } from '#utils/scouterbee/projects.ts'

export default async function scouterBee(fastify: FastifyInstance) {
    // Bun.cron('0 12 * * *', () => {
        fastify.log.info('Starting scheduled npm vulnerability scout...')
        runProjectScout()
    // })
}
