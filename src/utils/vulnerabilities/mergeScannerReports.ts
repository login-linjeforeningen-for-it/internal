import buildGroupBreakdown from './buildGroupBreakdown.ts'
import emptySeverityCount from './emptySeverityCount.ts'
import getScannerOrder from './getScannerOrder.ts'
import getVulnerabilityMergeKey from './getVulnerabilityMergeKey.ts'
import mergeVulnerabilityDetail from './mergeVulnerabilityDetail.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'

type ScannerImageReport = Omit<ImageVulnerabilityReport, 'image' | 'scannedAt' | 'totalVulnerabilities' | 'scannerResults' | 'scanError'>
    & VulnerabilityScannerResult

export default function mergeScannerReports(image: string, reports: ScannerImageReport[]): ImageVulnerabilityReport {
    const mergedVulnerabilities = new Map<string, VulnerabilityDetail>()

    for (const report of reports) {
        for (const vulnerability of report.vulnerabilities) {
            const key = getVulnerabilityMergeKey(vulnerability)
            const current = mergedVulnerabilities.get(key)
            mergedVulnerabilities.set(
                key,
                current ? mergeVulnerabilityDetail(current, vulnerability) : vulnerability
            )
        }
    }

    const vulnerabilities = sortVulnerabilityDetails(Array.from(mergedVulnerabilities.values()))
    const severity = emptySeverityCount()
    for (const vulnerability of vulnerabilities) {
        severity[vulnerability.severity] += 1
    }

    const scannerResults = reports
        .map(({ scanner, scannedAt, totalVulnerabilities, severity: scannerSeverity, scanError, summaryOnly, note }) => ({
            scanner,
            scannedAt,
            totalVulnerabilities,
            severity: scannerSeverity,
            scanError,
            summaryOnly,
            note,
        }))
        .sort((left, right) => getScannerOrder(left.scanner) - getScannerOrder(right.scanner))

    const scanErrors = scannerResults
        .filter((result) => result.scanError)
        .map((result) => `${formatScannerName(result.scanner)}: ${result.scanError}`)

    for (const result of scannerResults) {
        for (const key of Object.keys(severity) as SeverityLevel[]) {
            severity[key] = Math.max(severity[key], result.severity[key] || 0)
        }
    }

    const totalFromSummaries = scannerResults.reduce(
        (highest, result) => Math.max(highest, result.totalVulnerabilities),
        0
    )

    return {
        image,
        scannedAt: scannerResults
            .map((result) => result.scannedAt)
            .sort()
            .at(-1) || new Date().toISOString(),
        totalVulnerabilities: Math.max(vulnerabilities.length, totalFromSummaries),
        severity,
        groups: buildGroupBreakdown(vulnerabilities),
        vulnerabilities,
        scannerResults,
        scanError: scanErrors.length ? scanErrors.join(' | ') : null,
    }
}

function formatScannerName(scanner: VulnerabilityScanner) {
    return scanner === 'docker_scout' ? 'Docker Scout' : 'Trivy'
}
