import type { FastifyReply, FastifyRequest } from 'fastify'
import validateToken from '#utils/auth/validateToken.ts'
import config from '#config'

declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string
            name: string
            email: string
            groups: string[]
        }
    }
}

function getDevUser() {
    if (process.env.NODE_ENV === 'production' || !process.env.DEV_AUTH_USER_JSON) {
        return null
    }

    try {
        const parsed = JSON.parse(process.env.DEV_AUTH_USER_JSON) as {
            id?: string
            name?: string
            email?: string
            groups?: string[]
        }

        if (!parsed.id || !parsed.name || !parsed.email) {
            return null
        }

        return {
            id: parsed.id,
            name: parsed.name,
            email: parsed.email,
            groups: parsed.groups || []
        }
    } catch {
        return null
    }
}

export default async function preHandler(req: FastifyRequest, res: FastifyReply) {
    const devUser = getDevUser()
    if (devUser && ['127.0.0.1', '::1'].includes(req.ip)) {
        req.user = devUser
        return
    }

    const tokenResult = await validateToken(req, res)
    if (!tokenResult.valid || !tokenResult.userInfo || !tokenResult.userInfo.sub) {
        return res.status(401).send({ error: tokenResult.error || 'Invalid user information' })
    }

    if (!tokenResult.userInfo.groups.includes(config.tekkom)) {
        return res.status(403).send({ error: 'Insufficient permissions' })
    }

    req.user = {
        id: tokenResult.userInfo.sub,
        name: tokenResult.userInfo.name,
        email: tokenResult.userInfo.email,
        groups: tokenResult.userInfo.groups || []
    }
}
