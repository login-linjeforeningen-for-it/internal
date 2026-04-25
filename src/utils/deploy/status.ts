import { exec } from 'child_process'
import { promisify } from 'util'
import { type DeployTarget, getDeployServiceName, getDeployTimerName, getDeployTarget, getDeployTargets } from './targets.ts'

const execAsync = promisify(exec)
const STATUS_CACHE_TTL_MS = 60 * 1000
const DEFAULT_COMMAND_TIMEOUT_MS = 2500
const GIT_FETCH_TIMEOUT_MS = 4000

export type DeployStatus = {
    id: string
    name: string
    repoPath: string
    branch: string
    serviceUnit: string
    timerUnit: string
    autoDeployEnabled: boolean
    autoDeployActive: boolean
    serviceActive: boolean
    updateAvailable: boolean
    behindCount: number
    currentCommit: string | null
    upstreamCommit: string | null
    dirty: boolean
    reachable: boolean
    activeState: string
    subState: string
    lastResult: string | null
    lastDeploymentAt: string | null
    lastAutoDeployAt: string | null
    error: string | null
}

const statusCache = new Map<string, { expiresAt: number, value: DeployStatus }>()

async function runCommand(command: string, cwd?: string, timeout = DEFAULT_COMMAND_TIMEOUT_MS) {
    return await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024,
    })
}

async function hasSystemctl() {
    try {
        await runCommand('command -v systemctl')
        return true
    } catch {
        return false
    }
}

async function getSystemctlState(name: string, mode: 'is-enabled' | 'is-active') {
    try {
        const { stdout } = await runCommand(`systemctl ${mode} ${name}`)
        return stdout.trim()
    } catch {
        return 'unknown'
    }
}

function parseSystemctlTimestampUs(raw: string | undefined) {
    const trimmed = raw?.trim()
    if (!trimmed || trimmed === '0') {
        return null
    }

    const micros = Number(trimmed)
    if (!Number.isFinite(micros) || micros <= 0) {
        return null
    }

    return new Date(micros / 1000).toISOString()
}

async function getSystemctlProperties(name: string, properties: string[]) {
    try {
        const { stdout } = await runCommand(`systemctl show ${name} --property=${properties.join(',')} --value=false`)
        const values = stdout.split('\n')

        return Object.fromEntries(properties.map((property, index) => [property, values[index]?.trim() ?? '']))
    } catch {
        return Object.fromEntries(properties.map(property => [property, '']))
    }
}

async function getGitState(target: DeployTarget) {
    try {
        await runCommand(`git fetch origin ${target.branch}`, target.repoPath, GIT_FETCH_TIMEOUT_MS)
        const [{ stdout: currentCommit }, { stdout: upstreamCommit }, { stdout: behindCount }, { stdout: dirtyOut }] = await Promise.all([
            runCommand('git rev-parse HEAD', target.repoPath),
            runCommand(`git rev-parse origin/${target.branch}`, target.repoPath),
            runCommand(`git rev-list --count HEAD..origin/${target.branch}`, target.repoPath),
            runCommand('git status --porcelain', target.repoPath),
        ])

        return {
            reachable: true,
            currentCommit: currentCommit.trim() || null,
            upstreamCommit: upstreamCommit.trim() || null,
            behindCount: Number(behindCount.trim() || 0),
            dirty: dirtyOut.trim().length > 0,
            error: null,
        }
    } catch (error) {
        return {
            reachable: false,
            currentCommit: null,
            upstreamCommit: null,
            behindCount: 0,
            dirty: false,
            error: (error as Error).message,
        }
    }
}

export async function getDeploymentStatus(id: string): Promise<DeployStatus | null> {
    const cached = statusCache.get(id)
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value
    }

    const target = getDeployTarget(id)
    if (!target) {
        return null
    }

    const serviceUnit = getDeployServiceName(id)
    const timerUnit = getDeployTimerName(id)
    const [systemctlAvailable, gitState] = await Promise.all([
        hasSystemctl(),
        getGitState(target),
    ])

    const [
        autoDeployEnabled,
        autoDeployActive,
        serviceActive,
        timerProperties,
        serviceProperties,
    ] = systemctlAvailable
        ? await Promise.all([
            getSystemctlState(timerUnit, 'is-enabled').then(state => state === 'enabled'),
            getSystemctlState(timerUnit, 'is-active').then(state => state === 'active'),
            getSystemctlState(serviceUnit, 'is-active').then(state => state === 'active'),
            getSystemctlProperties(timerUnit, ['LastTriggerUSec']),
            getSystemctlProperties(serviceUnit, ['ActiveState', 'SubState', 'Result', 'ExecMainStartTimestampUSec']),
        ])
        : [
            false,
            false,
            false,
            { LastTriggerUSec: '' },
            { ActiveState: '', SubState: '', Result: '', ExecMainStartTimestampUSec: '' }
        ]

    const result = {
        id: target.id,
        name: target.name,
        repoPath: target.repoPath,
        branch: target.branch,
        serviceUnit,
        timerUnit,
        autoDeployEnabled,
        autoDeployActive,
        serviceActive,
        updateAvailable: gitState.behindCount > 0,
        behindCount: gitState.behindCount,
        currentCommit: gitState.currentCommit,
        upstreamCommit: gitState.upstreamCommit,
        dirty: gitState.dirty,
        reachable: gitState.reachable,
        activeState: serviceProperties.ActiveState || 'unknown',
        subState: serviceProperties.SubState || 'unknown',
        lastResult: serviceProperties.Result || null,
        lastDeploymentAt: parseSystemctlTimestampUs(serviceProperties.ExecMainStartTimestampUSec),
        lastAutoDeployAt: parseSystemctlTimestampUs(timerProperties.LastTriggerUSec),
        error: gitState.error,
    }

    statusCache.set(id, {
        value: result,
        expiresAt: Date.now() + (
            result.activeState === 'activating'
                ? 2000
                : STATUS_CACHE_TTL_MS
        )
    })

    return result
}

export async function listDeploymentStatuses() {
    return await Promise.all(getDeployTargets().map(async target => await getDeploymentStatus(target.id)))
}

export async function runDeployment(id: string) {
    const target = getDeployTarget(id)
    if (!target) {
        throw new Error('Unknown deployment target')
    }

    if (await hasSystemctl()) {
        await runCommand(`systemctl start ${getDeployServiceName(id)}`, undefined, 5000)
        statusCache.delete(id)
        return { ok: true, mode: 'systemctl', service: getDeployServiceName(id) }
    }

    await runCommand(`git pull --ff-only origin ${target.branch}`, target.repoPath, 10000)
    await runCommand(target.composeCommand, target.repoPath, 30000)
    statusCache.delete(id)
    return { ok: true, mode: 'direct', service: target.id }
}

export async function setAutoDeploy(id: string, enabled: boolean) {
    const target = getDeployTarget(id)
    if (!target) {
        throw new Error('Unknown deployment target')
    }

    if (!(await hasSystemctl())) {
        throw new Error('systemctl is not available on this host')
    }

    const timerUnit = getDeployTimerName(id)
    await runCommand(`systemctl ${enabled ? 'enable --now' : 'disable --now'} ${timerUnit}`, undefined, 5000)
    statusCache.delete(id)
    return {
        ok: true,
        timerUnit,
        enabled,
    }
}
