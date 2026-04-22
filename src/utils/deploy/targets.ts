export type DeployTarget = {
    id: string
    name: string
    repoPath: string
    branch: string
    composeCommand: string
}

const defaultTargets: DeployTarget[] = [
    { id: 'beehive', name: 'Beehive', repoPath: '/home/ubuntu/beehive', branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'beekeeper', name: 'Beekeeper', repoPath: '/home/ubuntu/beekeeper', branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'queenbee', name: 'Queenbee', repoPath: '/home/ubuntu/queenbee', branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'workerbee', name: 'Workerbee', repoPath: '/home/ubuntu/workerbee', branch: 'main', composeCommand: 'docker compose up -d --build' },
    { id: 'internal', name: 'Internal API', repoPath: '/home/ubuntu/internal', branch: 'main', composeCommand: 'docker compose up -d --build' },
]

export function getDeployTargets(): DeployTarget[] {
    const raw = process.env.DEPLOY_TARGETS_JSON
    if (!raw) {
        return defaultTargets
    }

    try {
        const parsed = JSON.parse(raw) as DeployTarget[]
        return Array.isArray(parsed) && parsed.length ? parsed : defaultTargets
    } catch {
        return defaultTargets
    }
}

export function getDeployTarget(id: string) {
    return getDeployTargets().find(target => target.id === id) || null
}

export function getDeployServiceName(id: string) {
    return `login-deploy@${id}.service`
}

export function getDeployTimerName(id: string) {
    return `login-deploy@${id}.timer`
}
