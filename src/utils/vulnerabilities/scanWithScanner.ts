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
import runTrivyScanRaw from './runTrivyScanRaw.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'

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
        }
    } catch (error: any) {
        return {
            scanner,
            scannedAt,
            totalVulnerabilities: 0,
            severity: emptySeverityCount(),
            groups: [],
            vulnerabilities: [],
            scanError: formatScanError(error),
        }
    }
}
