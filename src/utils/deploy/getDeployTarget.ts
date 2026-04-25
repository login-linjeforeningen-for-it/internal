import getDeployTargets from './getDeployTargets.ts'

export default function getDeployTarget(id: string) {
    const normalizedId = id.trim().toLowerCase()
    const targets = getDeployTargets()

    const exactMatch = targets.find((target) => target.id.toLowerCase() === normalizedId)
    if (exactMatch) {
        return exactMatch
    }

    const prefixMatch = [...targets]
        .sort((a, b) => b.id.length - a.id.length)
        .find((target) => {
            const targetId = target.id.toLowerCase()
            return normalizedId.startsWith(`${targetId}_`) || normalizedId.startsWith(`${targetId}-`)
        })

    return prefixMatch || null
}
