import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import defaultTargets, { type DeployTarget } from './defaultTargets.ts'

const composeFilenames = ['docker-compose.yml', 'compose.yml', 'compose.yaml']

function toDisplayName(id: string) {
    return id
        .split(/[_-]+/)
        .filter(Boolean)
        .map(part => part === 'api' ? 'API' : `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
        .join(' ')
}

function getDiscoveryRoots() {
    const workspaceRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../..'
    )

    return [
        process.env.DEPLOY_ROOT,
        workspaceRoot,
        process.env.HOME,
    ].filter((value): value is string => Boolean(value))
}

function autoDiscoverDeployTargets(): DeployTarget[] {
    const discovered = new Map<string, DeployTarget>()

    for (const root of getDiscoveryRoots()) {
        if (!fs.existsSync(root)) {
            continue
        }

        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue
            }

            const repoPath = path.join(root, entry.name)
            const hasComposeFile = composeFilenames.some(filename =>
                fs.existsSync(path.join(repoPath, filename))
            )

            if (!hasComposeFile || discovered.has(entry.name)) {
                continue
            }

            discovered.set(entry.name, {
                id: entry.name,
                name: toDisplayName(entry.name),
                repoPath,
                branch: 'main',
                composeCommand: 'docker compose up -d --build',
            })
        }
    }

    return [...discovered.values()]
}

export default function getDeployTargets(): DeployTarget[] {
    const raw = process.env.DEPLOY_TARGETS_JSON
    const discoveredTargets = autoDiscoverDeployTargets()

    if (!raw) {
        return [
            ...defaultTargets,
            ...discoveredTargets.filter(target =>
                !defaultTargets.some(defaultTarget => defaultTarget.id === target.id)
            )
        ]
    }

    try {
        const parsed = JSON.parse(raw) as DeployTarget[]
        const baseTargets = Array.isArray(parsed) && parsed.length ? parsed : defaultTargets

        return [
            ...baseTargets,
            ...discoveredTargets.filter(target =>
                !baseTargets.some(baseTarget => baseTarget.id === target.id)
            )
        ]
    } catch {
        return [
            ...defaultTargets,
            ...discoveredTargets.filter(target =>
                !defaultTargets.some(defaultTarget => defaultTarget.id === target.id)
            )
        ]
    }
}
