import cors from '@fastify/cors'
import Fastify from 'fastify'
import routes from './routes.ts'
import getIndex from './handlers/index/get.ts'
import getFavicon from './handlers/favicon/getFavicon.ts'
import websocketPlugin from '@fastify/websocket'
import ws from './plugins/ws.ts'
import backupScheduler from './plugins/backupScheduler.ts'
import logAlertScheduler from './plugins/logAlertScheduler.ts'
import vulnerabilityScheduler from './plugins/vulnerabilityScheduler.ts'
import fs from 'fs'
import path from 'path'
import { installJsonConsoleLogger, log } from './utils/jsonLogger.ts'
import getServiceName from './utils/runtime/getServiceName.ts'

process.env.TZ = 'Europe/Oslo'
installJsonConsoleLogger()

const fastify = Fastify({
    logger: {
        level: process.env.LOG_LEVEL ?? 'info',
        base: {
            service: getServiceName(),
            runtime: 'api',
            environment: process.env.NODE_ENV ?? 'development',
        },
        redact: {
            paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers.x-auth-request-access-token',
                'req.headers.x-auth-request-token',
            ],
            censor: '[REDACTED]'
        },
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
        formatters: {
            level(label) {
                return { level: label }
            }
        }
    }
})

fastify.register(websocketPlugin)
fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']
})

const port = Number(process.env.PORT) || 8001

fastify.decorate('favicon', fs.readFileSync(path.join(process.cwd(), 'public', 'favicon.ico')))
fastify.register(ws, { prefix: "/api" })
fastify.register(backupScheduler)
fastify.register(logAlertScheduler)
fastify.register(vulnerabilityScheduler)
fastify.register(routes, { prefix: "/api" })
fastify.get('/', getIndex)
fastify.get('/favicon.ico', getFavicon)

async function start() {
    try {
        await fastify.listen({ port, host: '0.0.0.0' })
        log('info', 'Internal API started', {
            event: 'api.started',
            port,
        })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()
