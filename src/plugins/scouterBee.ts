import type { FastifyInstance } from 'fastify'
import { runProjectScout } from '#utils/scouterbee/projects.ts'
import config from '#config'

export default async function scouterBee(fastify: FastifyInstance) {
    // Bun.cron('0 12 * * *', () => {
        fastify.log.info('Starting scheduled npm vulnerability scout...')
        runProjectScout()
        console.log(config.scout.role)
    // })
}
