import getDeployTargets from './getDeployTargets.ts'

export default function getDeployTarget(id: string) {
    return getDeployTargets().find((target) => target.id === id) || null
}
