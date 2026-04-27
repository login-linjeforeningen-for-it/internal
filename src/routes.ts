import type { FastifyInstance, FastifyPluginOptions } from "fastify"
import getIndex from './handlers/index/get.ts'
import getDockerContainers from './handlers/docker/get.ts'
import restartHandler from './handlers/docker/restart.ts'
import getServerStats from './handlers/stats/get.ts'
import restartServiceHandler from './handlers/docker/restartService.ts'
import getIngress from './handlers/nginx/getIngress.ts'
import getDockerContainer from './handlers/docker/getContainer.ts'
import getDockerLogs from './handlers/docker/getLogs.ts'
import getDeployments from './handlers/deploy/getDeployments.ts'
import getDeployment from './handlers/deploy/getDeployment.ts'
import postDeploy from './handlers/deploy/postDeploy.ts'
import putAutoDeploy from './handlers/deploy/putAutoDeploy.ts'
import getBackupStats from './handlers/backup/get.ts'
import getBackupFiles from './handlers/backup/getFiles.ts'
import restoreBackup from './handlers/backup/post.ts'
import triggerBackup from './handlers/backup/trigger.ts'
import preHandler from '#utils/auth/authMiddleware.ts'
import getDatabaseCount from './handlers/backup/getCount.ts'
import getDashboardStats from './handlers/stats/getDashboard.ts'
import getVulnerabilities from './handlers/vulnerabilities/get.ts'
import runVulnerabilityScan from './handlers/vulnerabilities/post.ts'
import getDatabaseOverview from './handlers/db/get.ts'
import getScout from './handlers/scout/get.ts'

export default async function apiRoutes(fastify: FastifyInstance, _: FastifyPluginOptions) {
    // index
    fastify.get('/', getIndex)

    // docker
    fastify.get('/docker', { preHandler }, getDockerContainers)
    fastify.get('/docker/:id', { preHandler }, getDockerContainer)
    fastify.get('/docker/logs', { preHandler }, getDockerLogs)
    fastify.get('/docker/restart/:id', { preHandler }, restartHandler)
    fastify.get('/docker/restart/service/:id', { preHandler }, restartServiceHandler)
    fastify.get('/deployments', { preHandler }, getDeployments)
    fastify.get('/deployments/:id', { preHandler }, getDeployment)
    fastify.post('/deployments/:id/run', { preHandler }, postDeploy)
    fastify.put('/deployments/:id/auto', { preHandler }, putAutoDeploy)

    // backup
    fastify.get('/backup', { preHandler }, getBackupStats)
    fastify.post('/backup', { preHandler }, triggerBackup)
    fastify.get('/databases', { preHandler }, getDatabaseCount)
    fastify.get('/db', { preHandler }, getDatabaseOverview)
    fastify.get('/backup/files', { preHandler }, getBackupFiles)
    fastify.post('/backup/restore', { preHandler }, restoreBackup)

    // ingress
    fastify.get('/ingress/:port', { preHandler }, getIngress)

    // stats
    fastify.get('/stats', { preHandler }, getServerStats)
    fastify.get('/stats/dashboard', { preHandler }, getDashboardStats)

    // vulnerabilities
    fastify.get('/vulnerabilities', { preHandler }, getVulnerabilities)
    fastify.post('/vulnerabilities/scan', { preHandler }, runVulnerabilityScan)

    // scout
    fastify.get('/scout', { preHandler }, getScout)
    fastify.get('/scouterbee', { preHandler }, getScout)
}
