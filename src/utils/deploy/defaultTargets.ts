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
    { id: 'internal', name: 'Internal', repoPath: '/home/ubuntu/internal', branch: 'main', composeCommand: 'docker compose up -d --build' },
]

export default defaultTargets
