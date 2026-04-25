import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export type DeployTarget = {
    id: string
    name: string
    repoPath: string
    branch: string
    composeCommand: string
}

function resolveRepoPath(id: string) {
    const repoWorkspaceRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../..'
    )
    const candidateBases = [
        process.env.DEPLOY_ROOT,
        repoWorkspaceRoot,
        path.resolve(process.cwd(), '..'),
        process.env.HOME,
        '/home/dev',
        '/home/ubuntu',
    ].filter((value): value is string => Boolean(value))

    for (const basePath of candidateBases) {
        const repoPath = path.join(basePath, id)
        if (fs.existsSync(repoPath)) {
            return repoPath
        }
    }

    return path.join(process.env.HOME || '/home/ubuntu', id)
}

const defaultTargets: DeployTarget[] = [
    { id: 'beehive', name: 'Beehive', repoPath: resolveRepoPath('beehive'), branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'beekeeper', name: 'Beekeeper', repoPath: resolveRepoPath('beekeeper'), branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'queenbee', name: 'Queenbee', repoPath: resolveRepoPath('queenbee'), branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'workerbee', name: 'Workerbee', repoPath: resolveRepoPath('workerbee'), branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'internal', name: 'Internal', repoPath: resolveRepoPath('internal'), branch: 'main', composeCommand: 'docker compose up -d --build' },
]

export default defaultTargets
