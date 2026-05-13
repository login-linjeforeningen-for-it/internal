import type { FastifyInstance } from 'fastify'
import cron from 'node-cron'
import { runProjectScout } from '#utils/scouterbee/projects.ts'

export default async function scouterBee(fastify: FastifyInstance) {
    cron.schedule('0 12 * * *', () => {
        fastify.log.info('Starting scheduled npm vulnerability scout...')
        void runProjectScout()
    })
}
