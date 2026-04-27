import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getScout, updateScout } from './state.ts'
import { sendProjectAlert } from './alerts.ts'

const oneDay = 24 * 60 * 60 * 1000

export async function runProjectScout(projectRoot: string) {
    const startedAt = new Date().toISOString()
    await updateScout((draft) => {
        draft.projects.lastStartedAt = startedAt
        draft.projects.lastError = null
    })

    try {
        const repositories = fs.readdirSync(projectRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => entry.name)

        const findings = await scoutRepositories(projectRoot, repositories)
        const current = getScout().projects.result?.notified ?? {
            critical: [],
            high: [],
            medium: [],
        } satisfies NotifiedVulnerabilities

        const nextNotified: NotifiedVulnerabilities = structuredClone(current)
        const report = buildProjectReport(findings, nextNotified)
        const now = Date.now()
        for (const level of ['critical', 'high', 'medium'] as const) {
            nextNotified[level] = nextNotified[level].filter((entry) => (now - entry.time) < oneDay)
        }

        let alertSent = false
        if (report) {
            await sendProjectAlert(report)
            alertSent = true
        }

        const finishedAt = new Date().toISOString()
        await updateScout((draft) => {
            draft.projectRoot = projectRoot
            draft.projects.lastFinishedAt = finishedAt
            draft.projects.lastSuccessAt = finishedAt
            draft.projects.result = {
                repositories,
                findings,
                notified: nextNotified,
                report,
                alertSent
            }
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await updateScout((draft) => {
            draft.projects.lastFinishedAt = new Date().toISOString()
            draft.projects.lastError = message
        })
    }
}

async function scoutRepositories(projectRoot: string, repositories: string[]) {
    const vulnerabilities: ProjectFinding[] = []

    for (const repository of repositories) {
        const repositoryDirectory = path.join(projectRoot, repository)
        const stack = [repositoryDirectory]

        while (stack.length > 0) {
            const currentDir = stack.pop()
            if (!currentDir) {
                continue
            }

            const entries = fs.readdirSync(currentDir, { withFileTypes: true })
            let hasPackageJson = false
            let hasPackageLockJson = false

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name)
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
                        continue
                    }
                    stack.push(fullPath)
                } else if (entry.isFile() && entry.name === 'package.json') {
                    hasPackageJson = true
                } else if (entry.isFile() && entry.name === 'package-lock.json') {
                    hasPackageLockJson = true
                }
            }

            if (!hasPackageJson || !hasPackageLockJson) {
                continue
            }

            const auditData = loadAuditData(currentDir)
            if (!auditData) {
                continue
            }

            const metadata = auditData?.metadata
            if (!metadata?.vulnerabilities || !Object.values(metadata.vulnerabilities).some((value) => Number(value) > 0)) {
                continue
            }

            vulnerabilities.push({
                repository,
                folder: currentDir,
                summary: `Vulnerabilities in ${repository}: ${JSON.stringify(metadata.vulnerabilities)}`,
                vulnerabilities: metadata.vulnerabilities
            })
        }
    }

    return vulnerabilities
}

function loadAuditData(currentDir: string) {
    try {
        const auditOutput = execSync('npm audit --json', { cwd: currentDir, stdio: 'pipe' }).toString()
        return parseAuditJson(currentDir, auditOutput)
    } catch (error) {
        const err = error as { stdout?: Buffer }
        if (!err.stdout || err.stdout.length === 0) {
            console.error(`npm audit failed in ${currentDir}:`, error)
            return null
        }

        return parseAuditJson(currentDir, err.stdout.toString())
    }
}

function parseAuditJson(currentDir: string, raw: string) {
    if (!raw.trim()) {
        console.error(`npm audit returned empty output in ${currentDir}`)
        return null
    }

    try {
        return JSON.parse(raw)
    } catch (error) {
        console.error(`npm audit JSON parse failed in ${currentDir}:`, error)
        return null
    }
}

function buildProjectReport(findings: ProjectFinding[], notified: NotifiedVulnerabilities) {
    const critical: Array<{ name: string, folder: string, count: number, high: number, medium: number }> = []
    const high: Array<{ name: string, folder: string, count: number, medium: number }> = []
    const medium: Array<{ name: string, folder: string, count: number }> = []

    for (const finding of findings) {
        if (finding.vulnerabilities.critical > 0) {
            critical.push({
                name: finding.repository,
                folder: finding.folder,
                count: finding.vulnerabilities.critical,
                high: finding.vulnerabilities.high,
                medium: finding.vulnerabilities.moderate,
            })
            continue
        }
        if (finding.vulnerabilities.high > 0) {
            high.push({
                name: finding.repository,
                folder: finding.folder,
                count: finding.vulnerabilities.high,
                medium: finding.vulnerabilities.moderate,
            })
            continue
        }
        if (finding.vulnerabilities.moderate > 0) {
            medium.push({
                name: finding.repository,
                folder: finding.folder,
                count: finding.vulnerabilities.moderate,
            })
        }
    }

    const finalReport: {
        title: string
        description: string
        highestSeverity: 'medium' | 'high' | 'critical'
    } = {
        title: '🐝 Vulnerability Report 🐝',
        description: '',
        highestSeverity: 'medium'
    }

    let shouldAlert = false
    const now = Date.now()

    for (const entry of critical) {
        if (!notified.critical.some((item) => item.name === entry.name && item.count <= entry.count)) {
            shouldAlert = true
            finalReport.highestSeverity = 'critical'
            finalReport.description += `**${entry.name} (${entry.folder})**\nCritical: ${entry.count}`
            finalReport.description += entry.high > 0 ? `, High: ${entry.high}` : ''
            finalReport.description += entry.medium > 0 ? `, Medium: ${entry.medium}` : ''
            finalReport.description += '.\n'
            notified.critical.push({ name: entry.name, folder: entry.folder, count: entry.count, time: now })
        }
    }

    for (const entry of high) {
        if (!notified.high.some((item) => item.name === entry.name && item.count <= entry.count)) {
            shouldAlert = true
            if (finalReport.highestSeverity === 'medium') {
                finalReport.highestSeverity = 'high'
            }
            finalReport.description += `**${entry.name} (${entry.folder})**\nHigh: ${entry.count}`
            finalReport.description += entry.medium > 0 ? `, Medium: ${entry.medium}` : ''
            finalReport.description += '.\n'
            notified.high.push({ name: entry.name, folder: entry.folder, count: entry.count, time: now })
        }
    }

    for (const entry of medium) {
        if (!notified.medium.some((item) => item.name === entry.name && item.count <= entry.count)) {
            finalReport.description += `**${entry.name} (${entry.folder})**\nMedium: ${entry.count}.\n`
            notified.medium.push({ name: entry.name, folder: entry.folder, count: entry.count, time: now })
        }
    }

    if (!shouldAlert) {
        return null
    }

    finalReport.description += '\n'
    if (critical.length > 0) {
        finalReport.description += 'Critical vulnerabilities should be patched immediately.\n'
    }
    if (high.length > 0) {
        finalReport.description += 'High vulnerabilities should be prioritized.\n'
    }
    if (medium.length > 0) {
        finalReport.description += 'Medium vulnerabilities should be patched when possible.\n'
    }

    return finalReport
}
