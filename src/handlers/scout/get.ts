import type { FastifyReply, FastifyRequest } from 'fastify'
import { ensureScout, getScout } from '#utils/scouterbee/state.ts'

export default async function getScoutHandler(_: FastifyRequest, reply: FastifyReply) {
    await ensureScout()
    return reply.send(getScout())
}
