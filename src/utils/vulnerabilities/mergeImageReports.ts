import buildGroupBreakdown from './buildGroupBreakdown.ts'
import emptySeverityCount from './emptySeverityCount.ts'
import getScannerOrder from './getScannerOrder.ts'
import getVulnerabilityMergeKey from './getVulnerabilityMergeKey.ts'
import mergeVulnerabilityDetail from './mergeVulnerabilityDetail.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'

export default function mergeImageReports(image: string, reports: ImageVulnerabilityReport[]): ImageVulnerabilityReport {
    const vulnerabilities = mergeVulnerabilities(reports)
    const scannerResults = mergeScannerResults(reports)
    const severity = severityFromReports(vulnerabilities, scannerResults)
    const scanErrors = scannerResults
        .filter((result) => result.scanError)
        .map((result) => `${formatScannerName(result.scanner)}: ${result.scanError}`)

    return {
        image,
        scannedAt: latestScanDate(scannerResults),
        totalVulnerabilities: Math.max(vulnerabilities.length, highestScannerTotal(scannerResults)),
        severity,
        groups: buildGroupBreakdown(vulnerabilities),
        vulnerabilities,
        scannerResults,
        scanError: scanErrors.length ? scanErrors.join(' | ') : null,
    }
}

function mergeVulnerabilities(reports: ImageVulnerabilityReport[]) {
    const merged = new Map<string, VulnerabilityDetail>()
    for (const report of reports) {
        for (const vulnerability of report.vulnerabilities) {
            const key = getVulnerabilityMergeKey(vulnerability)
            const current = merged.get(key)
            merged.set(key, current ? mergeVulnerabilityDetail(current, vulnerability) : vulnerability)
        }
    }

    return sortVulnerabilityDetails(Array.from(merged.values()))
}

function mergeScannerResults(reports: ImageVulnerabilityReport[]) {
    const merged = new Map<VulnerabilityScanner, VulnerabilityScannerResult>()
    for (const report of reports) {
        for (const result of report.scannerResults || []) {
            const current = merged.get(result.scanner)
            merged.set(result.scanner, current ? combineScannerResults(current, result) : result)
        }
    }

    return Array.from(merged.values())
        .sort((left, right) => getScannerOrder(left.scanner) - getScannerOrder(right.scanner))
}

function combineScannerResults(left: VulnerabilityScannerResult, right: VulnerabilityScannerResult): VulnerabilityScannerResult {
    return {
        scanner: left.scanner,
        scannedAt: [left.scannedAt, right.scannedAt].sort().at(-1) || new Date().toISOString(),
        totalVulnerabilities: left.totalVulnerabilities + right.totalVulnerabilities,
        severity: addSeverity(left.severity, right.severity),
        scanError: [left.scanError, right.scanError].filter(Boolean).join(' | ') || null,
        summaryOnly: Boolean(left.summaryOnly || right.summaryOnly),
        note: [left.note, right.note].filter(Boolean).join(' | ') || null,
    }
}

function severityFromReports(vulnerabilities: VulnerabilityDetail[], scannerResults: VulnerabilityScannerResult[]) {
    const severity = emptySeverityCount()
    for (const vulnerability of vulnerabilities) {
        severity[vulnerability.severity] += 1
    }

    for (const result of scannerResults) {
        for (const key of Object.keys(severity) as SeverityLevel[]) {
            severity[key] = Math.max(severity[key], result.severity[key] || 0)
        }
    }

    return severity
}

function addSeverity(left: SeverityCount, right: SeverityCount) {
    const severity = emptySeverityCount()
    for (const key of Object.keys(severity) as SeverityLevel[]) {
        severity[key] = Number(left[key] || 0) + Number(right[key] || 0)
    }

    return severity
}

function highestScannerTotal(scannerResults: VulnerabilityScannerResult[]) {
    return scannerResults.reduce((highest, result) => {
        return Math.max(highest, result.totalVulnerabilities)
    }, 0)
}

function latestScanDate(scannerResults: VulnerabilityScannerResult[]) {
    return scannerResults
        .map((result) => result.scannedAt)
        .sort()
        .at(-1) || new Date().toISOString()
}

function formatScannerName(scanner: VulnerabilityScanner) {
    if (scanner === 'docker_scout') {
        return 'docker scout'
    }

    if (scanner === 'npm_audit') {
        return 'npm audit'
    }

    return 'trivy'
}
