import { exec } from 'child_process'
import { promisify } from 'util'
import { type DeployTarget, getDeployServiceName, getDeployTimerName, getDeployTarget, getDeployTargets } from './targets.ts'

const execAsync = promisify(exec)
const STATUS_CACHE_TTL_MS = 60 * 1000
const DEFAULT_COMMAND_TIMEOUT_MS = 2500
const GIT_FETCH_TIMEOUT_MS = 4000
const systemctlScopeCache = new Map<string, 'user' | 'system' | 'none'>()

export type DeployStatus = {
    id: string
    name: string
    repoPath: string
    branch: string
    serviceUnit: string
    timerUnit: string
    unitScope: 'user' | 'system' | 'none'
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

function getSystemctlCommand(scope: 'user' | 'system') {
    return scope === 'user' ? 'systemctl --user' : 'systemctl'
}

async function getSystemctlScope(name: string) {
    const cached = systemctlScopeCache.get(name)
    if (cached) {
        return cached
    }

    try {
        const { stdout } = await runCommand(`systemctl --user show ${name} --property=Id --value`, undefined, 1500)
        if (stdout.trim() === name) {
            systemctlScopeCache.set(name, 'user')
            return 'user' as const
        }
    } catch {
        // Fall through to system scope detection below.
    }

    try {
        const { stdout } = await runCommand(`systemctl show ${name} --property=Id --value`, undefined, 1500)
        if (stdout.trim() === name) {
            systemctlScopeCache.set(name, 'system')
            return 'system' as const
        }
    } catch {
        // No installed unit in this scope.
    }

    systemctlScopeCache.set(name, 'none')
    return 'none' as const
}

async function getSystemctlState(scope: 'user' | 'system', name: string, mode: 'is-enabled' | 'is-active') {
    try {
        const { stdout } = await runCommand(`${getSystemctlCommand(scope)} ${mode} ${name}`)
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

function parseJournalTimestampUs(raw: string | undefined) {
    const trimmed = raw?.trim()
    if (!trimmed) {
        return null
    }

    const micros = Number(trimmed)
    if (!Number.isFinite(micros) || micros <= 0) {
        return null
    }

    return new Date(micros / 1000).toISOString()
}

async function getSystemctlProperties(scope: 'user' | 'system', name: string, properties: string[]) {
    try {
        const { stdout } = await runCommand(`${getSystemctlCommand(scope)} show ${name} --property=${properties.join(',')}`)
        const values = Object.fromEntries(
            stdout
                .split('\n')
                .filter(Boolean)
                .map(line => {
                    const separator = line.indexOf('=')
                    const key = separator >= 0 ? line.slice(0, separator) : line
                    const value = separator >= 0 ? line.slice(separator + 1) : ''
                    return [key.trim(), value.trim()]
                })
        )

        return Object.fromEntries(properties.map(property => [property, values[property] ?? '']))
    } catch {
        return Object.fromEntries(properties.map(property => [property, '']))
    }
}

async function getJournalTimestamp(scope: 'user' | 'system', unit: string) {
    const journalCommand = scope === 'user'
        ? `journalctl --user -u ${unit} -n 1 --output=json --no-pager`
        : `journalctl -u ${unit} -n 1 --output=json --no-pager`

    try {
        const { stdout } = await runCommand(journalCommand, undefined, 2000)
        const lastLine = stdout
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .at(-1)

        if (!lastLine) {
            return null
        }

        const payload = JSON.parse(lastLine) as { __REALTIME_TIMESTAMP?: string }
        return parseJournalTimestampUs(payload.__REALTIME_TIMESTAMP)
    } catch {
        return null
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
    const unitScope = systemctlAvailable
        ? await getSystemctlScope(serviceUnit)
        : 'none'

    const [
        autoDeployEnabled,
        autoDeployActive,
        serviceActive,
        timerProperties,
        serviceProperties,
        journalLastDeploymentAt,
        journalLastAutoDeployAt,
    ] = systemctlAvailable && unitScope !== 'none'
        ? await Promise.all([
            getSystemctlState(unitScope, timerUnit, 'is-enabled').then(state => state === 'enabled'),
            getSystemctlState(unitScope, timerUnit, 'is-active').then(state => state === 'active'),
            getSystemctlState(unitScope, serviceUnit, 'is-active').then(state => state === 'active'),
            getSystemctlProperties(unitScope, timerUnit, ['LastTriggerUSec']),
            getSystemctlProperties(unitScope, serviceUnit, ['ActiveState', 'SubState', 'Result', 'ExecMainStartTimestampUSec']),
            getJournalTimestamp(unitScope, serviceUnit),
            getJournalTimestamp(unitScope, timerUnit),
        ])
        : [
            false,
            false,
            false,
            { LastTriggerUSec: '' },
            { ActiveState: '', SubState: '', Result: '', ExecMainStartTimestampUSec: '' },
            null,
            null,
        ]

    const result = {
        id: target.id,
        name: target.name,
        repoPath: target.repoPath,
        branch: target.branch,
        serviceUnit,
        timerUnit,
        unitScope,
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
        lastDeploymentAt: parseSystemctlTimestampUs(serviceProperties.ExecMainStartTimestampUSec) || journalLastDeploymentAt,
        lastAutoDeployAt: parseSystemctlTimestampUs(timerProperties.LastTriggerUSec) || journalLastAutoDeployAt,
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
        const scope = await getSystemctlScope(getDeployServiceName(id))
        if (scope !== 'none') {
            await runCommand(`${getSystemctlCommand(scope)} start ${getDeployServiceName(id)}`, undefined, 5000)
            statusCache.delete(id)
            return { ok: true, mode: scope === 'user' ? 'systemctl-user' : 'systemctl', service: getDeployServiceName(id) }
        }
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
    const scope = await getSystemctlScope(getDeployServiceName(id))
    if (scope === 'none') {
        throw new Error('No deploy unit is installed for this target')
    }

    await runCommand(`${getSystemctlCommand(scope)} ${enabled ? 'enable --now' : 'disable --now'} ${timerUnit}`, undefined, 5000)
    statusCache.delete(id)
    return {
        ok: true,
        timerUnit,
        enabled,
    }
}
