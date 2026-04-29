import path from 'path'
import { auditPackageFolder, npmAuditImageName, skippedNpmAuditReport } from './npmAuditReport.ts'
import { findPackageFolderForImage, findPackageFolders } from './findNpmPackages.ts'
import type { ScannerImageReport } from './npmAuditTypes.ts'

const PROJECT_ROOT = path.resolve(process.env.SCOUTERBEE_PROJECT_ROOT || process.env.DEPLOY_ROOT || '/workspace')

export default async function scanWithNpmAudit(image: string): Promise<ScannerImageReport | null> {
    const scannedAt = new Date().toISOString()

    try {
        const project = findPackageFolderForImage(PROJECT_ROOT, image)
        if (!project) {
            return null
        }

        return auditPackageFolder(project, scannedAt)
    } catch (error) {
        return skippedNpmAuditReport(scannedAt, error)
    }
}

export async function scanNpmAuditProjects(): Promise<ImageVulnerabilityReport[]> {
    const reports: ImageVulnerabilityReport[] = []
    for (const project of npmAuditProjects()) {
        const scannedAt = new Date().toISOString()
        const scannerReport = scanPackageProject(project, scannedAt)
        reports.push(projectReport(project, scannerReport))
    }

    return reports
}

export function countNpmAuditProjects() {
    const projects = npmAuditProjects()
    const count = projects.length
    return count
}

function npmAuditProjects() {
    const projects = findPackageFolders(PROJECT_ROOT)
    if (!projects.length) {
        return []
    }

    return projects
}

function scanPackageProject(project: ReturnType<typeof npmAuditProjects>[number], scannedAt: string) {
    try {
        return auditPackageFolder(project, scannedAt)
    } catch (error) {
        return skippedNpmAuditReport(scannedAt, error)
    }
}

function projectReport(project: ReturnType<typeof npmAuditProjects>[number], scannerReport: ScannerImageReport): ImageVulnerabilityReport {
    return {
        image: npmAuditImageName(project),
        scannedAt: scannerReport.scannedAt,
        totalVulnerabilities: scannerReport.totalVulnerabilities,
        severity: scannerReport.severity,
        groups: scannerReport.groups,
        vulnerabilities: scannerReport.vulnerabilities,
        scannerResults: [scannerSummary(scannerReport)],
        scanError: scannerReport.scanError,
    }
}

function scannerSummary(scannerReport: ScannerImageReport): VulnerabilityScannerResult {
    return {
        scanner: scannerReport.scanner,
        scannedAt: scannerReport.scannedAt,
        totalVulnerabilities: scannerReport.totalVulnerabilities,
        severity: scannerReport.severity,
        scanError: scannerReport.scanError,
        summaryOnly: scannerReport.summaryOnly,
        note: scannerReport.note,
    }
}
