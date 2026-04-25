import defaultTargets, { type DeployTarget } from './defaultTargets.ts'

export default function getDeployTargets(): DeployTarget[] {
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
