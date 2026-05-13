import { sendProjectAlert } from './alerts.ts'
import { loadReport } from '../vulnerabilities/storage.ts'

type Finding = {
    name: string
    critical: number
    high: number
    medium: number
}

export async function runProjectScout() {
    try {
        const report = await loadReport()
        const findings = buildFindings(report)
        const alert = buildAlert(findings)
        if (alert) await sendProjectAlert(alert)
    } catch (error) {
        console.error('Scout error:', error)
    }
}

function buildFindings(report: VulnerabilityReportFile): Finding[] {
    return report.images.flatMap(image => {
        const npm = image.vulnerabilities.filter(v => v.packageType === 'npm')
        if (npm.length === 0) return []

        const counts = { critical: 0, high: 0, medium: 0 }
        for (const v of npm) {
            if (v.severity === 'critical') counts.critical++
            else if (v.severity === 'high') counts.high++
            else if (v.severity === 'medium') counts.medium++
        }

        return [{ name: image.image, ...counts }]
    })
}

function buildAlert(findings: Finding[]) {
    const alertable = findings.filter(f => f.critical > 0 || f.high > 0)
    if (alertable.length === 0) return null

    const highestSeverity = alertable.some(f => f.critical > 0) ? 'critical' : 'high'

    let description = ''
    for (const f of alertable) {
        description += `**${f.name}**\n`
        if (f.critical > 0) description += `Critical: ${f.critical}`
        if (f.high > 0) description += (f.critical > 0 ? ', ' : '') + `High: ${f.high}`
        if (f.medium > 0) description += (f.critical > 0 || f.high > 0 ? ', ' : '') + `Medium: ${f.medium}`
        description += '.\n'
    }

    description += highestSeverity === 'critical'
        ? '\nCritical vulnerabilities should be patched immediately.\n'
        : '\nHigh vulnerabilities should be prioritized.\n'

    return { title: '🐝 Vulnerability Report 🐝', description, highestSeverity } as const
}
