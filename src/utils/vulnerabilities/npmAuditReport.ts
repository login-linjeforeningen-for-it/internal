import path from 'path'
import buildGroupBreakdown from './buildGroupBreakdown.ts'
import emptySeverityCount from './emptySeverityCount.ts'
import runNpmAudit, { formatAuditSkipReason } from './runNpmAudit.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'
import type { NpmAuditMetadata, NpmAuditReport, NpmAuditVia, NpmAuditVulnerability, PackageFolder, ScannerImageReport } from './npmAuditTypes.ts'

export function auditPackageFolder(project: PackageFolder, scannedAt: string): ScannerImageReport {
    const report = runNpmAudit(project.directory)
    const severity = severityFromMetadata(report.metadata)
    const vulnerabilities = sortVulnerabilityDetails(vulnerabilityDetails(report, project))

    return {
        scanner: 'npm_audit',
        scannedAt,
        totalVulnerabilities: metadataTotal(report.metadata) ?? vulnerabilities.length,
        severity,
        groups: buildGroupBreakdown(vulnerabilities),
        vulnerabilities,
        scanError: null,
        summaryOnly: false,
        note: `Audited ${project.relativePath || project.name || project.directory}`,
    }
}

export function skippedNpmAuditReport(scannedAt: string, error: unknown): ScannerImageReport {
    const note = `npm audit was skipped because it did not return a usable report: ${formatAuditSkipReason(error)}`
    return {
        scanner: 'npm_audit',
        scannedAt,
        totalVulnerabilities: 0,
        severity: emptySeverityCount(),
        groups: [],
        vulnerabilities: [],
        scanError: note,
        summaryOnly: true,
        note,
    }
}

export function npmAuditImageName(project: PackageFolder) {
    const fallback = path.basename(project.directory)
    const label = project.relativePath || project.name || fallback
    return `npm:${label}`
}

function vulnerabilityDetails(report: NpmAuditReport, project: PackageFolder): VulnerabilityDetail[] {
    const vulnerabilities: VulnerabilityDetail[] = []
    for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities || {})) {
        const advisories = (vulnerability.via || [])
            .filter((entry): entry is NpmAuditVia => typeof entry === 'object' && entry !== null)
        if (!advisories.length) {
            vulnerabilities.push(packageVulnerability(packageName, vulnerability, project))
            continue
        }

        for (const advisory of advisories) {
            vulnerabilities.push(advisoryVulnerability(packageName, vulnerability, advisory, project))
        }
    }

    return vulnerabilities
}

function packageVulnerability(packageName: string, vulnerability: NpmAuditVulnerability, project: PackageFolder): VulnerabilityDetail {
    return {
        id: `npm:${packageName}`,
        title: `${packageName} npm audit finding`,
        severity: auditSeverity(vulnerability.severity),
        source: project.relativePath || project.name || 'npm audit',
        packageName,
        packageType: 'npm',
        installedVersion: vulnerability.range || null,
        fixedVersion: fixedVersion(vulnerability.fixAvailable),
        description: null,
        references: [],
        scanners: ['npm_audit'],
    }
}

function advisoryVulnerability(packageName: string, vulnerability: NpmAuditVulnerability, advisory: NpmAuditVia, project: PackageFolder): VulnerabilityDetail {
    return {
        id: advisory.source ? `npm:${advisory.source}` : `npm:${packageName}`,
        title: advisory.title || `${packageName} npm audit finding`,
        severity: auditSeverity(advisory.severity || vulnerability.severity),
        source: project.relativePath || project.name || 'npm audit',
        packageName: advisory.name || packageName,
        packageType: 'npm',
        installedVersion: advisory.range || vulnerability.range || null,
        fixedVersion: fixedVersion(vulnerability.fixAvailable),
        description: advisory.title || null,
        references: advisory.url ? [advisory.url] : [],
        scanners: ['npm_audit'],
    }
}

function severityFromMetadata(metadata?: NpmAuditMetadata) {
    const severity = emptySeverityCount()
    const counts = metadata?.vulnerabilities || {}
    severity.critical = Number(counts.critical || 0)
    severity.high = Number(counts.high || 0)
    severity.medium = Number(counts.moderate || 0)
    severity.low = Number(counts.low || 0)
    severity.unknown = Number(counts.info || 0)
    return severity
}

function metadataTotal(metadata?: NpmAuditMetadata) {
    const total = metadata?.vulnerabilities?.total
    if (typeof total !== 'number') return null
    return total
}

function auditSeverity(value?: string): SeverityLevel {
    if (value === 'critical' || value === 'high' || value === 'low') return value
    if (value === 'moderate' || value === 'medium') return 'medium'
    return 'unknown'
}

function fixedVersion(fixAvailable: NpmAuditVulnerability['fixAvailable']) {
    if (typeof fixAvailable === 'object' && typeof fixAvailable.version === 'string') {
        return fixAvailable.version
    }

    return fixAvailable ? 'Available' : null
}
