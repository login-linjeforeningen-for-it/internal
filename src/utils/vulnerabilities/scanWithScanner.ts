import buildGroupBreakdown from './buildGroupBreakdown.ts'
import collectVulnerabilities from './collectVulnerabilities.ts'
import emptySeverityCount from './emptySeverityCount.ts'
import extractDescription from './extractDescription.ts'
import extractFixedVersion from './extractFixedVersion.ts'
import extractInstalledVersion from './extractInstalledVersion.ts'
import extractPackageName from './extractPackageName.ts'
import extractPackageType from './extractPackageType.ts'
import extractReferences from './extractReferences.ts'
import extractSeverity from './extractSeverity.ts'
import extractSource from './extractSource.ts'
import extractTitle from './extractTitle.ts'
import extractVulnerabilityId from './extractVulnerabilityId.ts'
import formatScanError from './formatScanError.ts'
import runDockerScoutScanRaw from './runDockerScoutScanRaw.ts'
import runDockerScoutQuickviewRaw from './runDockerScoutQuickviewRaw.ts'
import parseDockerScoutQuickview from './parseDockerScoutQuickview.ts'
import isDockerScoutLimitedError from './isDockerScoutLimitedError.ts'
import runTrivyScanRaw from './runTrivyScanRaw.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'

const SCOUT_UNAVAILABLE_NOTE = 'Docker Scout is unavailable for this image. Showing Trivy results when available.'

type ScannerImageReport = Omit<ImageVulnerabilityReport, 'image' | 'scannedAt' | 'totalVulnerabilities' | 'scannerResults' | 'scanError'>
    & VulnerabilityScannerResult

export default async function scanWithScanner(scanner: VulnerabilityScanner, image: string): Promise<ScannerImageReport> {
    const scannedAt = new Date().toISOString()

    try {
        const parsed = scanner === 'docker_scout'
            ? await runDockerScoutScanRaw(image)
            : await runTrivyScanRaw(image)
        const vulnerabilities = collectVulnerabilities(parsed)
        const severity = emptySeverityCount()
        const details: VulnerabilityDetail[] = []

        for (const vulnerability of vulnerabilities) {
            const normalizedSeverity = extractSeverity(vulnerability)
            severity[normalizedSeverity] += 1

            details.push({
                id: extractVulnerabilityId(vulnerability),
                title: extractTitle(vulnerability),
                severity: normalizedSeverity,
                source: extractSource(vulnerability),
                packageName: extractPackageName(vulnerability),
                packageType: extractPackageType(vulnerability),
                installedVersion: extractInstalledVersion(vulnerability),
                fixedVersion: extractFixedVersion(vulnerability),
                description: extractDescription(vulnerability),
                references: extractReferences(vulnerability),
                scanners: [scanner],
            })
        }

        const sortedDetails = sortVulnerabilityDetails(details)

        return {
            scanner,
            scannedAt,
            totalVulnerabilities: sortedDetails.length,
            severity,
            groups: buildGroupBreakdown(sortedDetails),
            vulnerabilities: sortedDetails,
            scanError: null,
            summaryOnly: false,
            note: null,
        }
    } catch (error: any) {
        if (scanner === 'docker_scout' && isDockerScoutLimitedError(error)) {
            return await buildScoutQuickviewFallback(image, scannedAt, error)
        }

        return {
            scanner,
            scannedAt,
            totalVulnerabilities: 0,
            severity: emptySeverityCount(),
            groups: [],
            vulnerabilities: [],
            scanError: formatScanError(error),
            summaryOnly: false,
            note: null,
        }
    }
}

async function buildScoutQuickviewFallback(image: string, scannedAt: string, error: unknown): Promise<ScannerImageReport> {
    try {
        const quickviewOutput = await runDockerScoutQuickviewRaw(image)
        const quickview = parseDockerScoutQuickview(quickviewOutput)

        return {
            scanner: 'docker_scout',
            scannedAt,
            totalVulnerabilities: quickview.totalVulnerabilities,
            severity: quickview.severity,
            groups: [],
            vulnerabilities: [],
            scanError: null,
            summaryOnly: true,
            note: 'Docker Scout detailed CVE data is unavailable for this image. Showing quickview summary only.',
        }
    } catch {
        return {
            scanner: 'docker_scout',
            scannedAt,
            totalVulnerabilities: 0,
            severity: emptySeverityCount(),
            groups: [],
            vulnerabilities: [],
            scanError: null,
            summaryOnly: true,
            note: SCOUT_UNAVAILABLE_NOTE,
        }
    }
}
