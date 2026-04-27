import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
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
import shellEscape from './shellEscape.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'

const execAsync = promisify(exec)

export default async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const scannedAt = new Date().toISOString()
    const reportDir = path.join(process.cwd(), 'data', 'tmp')
    const cacheDir = path.join(process.cwd(), 'data', 'trivy-cache')
    const reportName = `trivy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    const reportPath = path.join(reportDir, reportName)

    try {
        await fs.mkdir(cacheDir, { recursive: true })
        await fs.mkdir(reportDir, { recursive: true })

        await execAsync(
            [
                'docker run --rm',
                '-v /var/run/docker.sock:/var/run/docker.sock',
                `-v ${shellEscape(cacheDir)}:/root/.cache/trivy`,
                `-v ${shellEscape(reportDir)}:/exports`,
                'aquasec/trivy:latest image --scanners vuln --format json',
                `--output ${shellEscape(`/exports/${reportName}`)}`,
                shellEscape(image),
            ].join(' '),
            { maxBuffer: 20 * 1024 * 1024 }
        )

        const parsed = await loadTrivyPayload(reportPath)
        const vulnerabilities = collectVulnerabilities(parsed)
        const totalSeverity = emptySeverityCount()
        const grouped = new Map<string, VulnerabilityGroup>()
        const details: VulnerabilityDetail[] = []

        for (const vulnerability of vulnerabilities) {
            const severity = extractSeverity(vulnerability)
            const source = extractSource(vulnerability)

            totalSeverity[severity] += 1

            if (!grouped.has(source)) {
                grouped.set(source, {
                    source,
                    total: 0,
                    severity: emptySeverityCount(),
                })
            }

            const group = grouped.get(source)
            if (!group) {
                continue
            }

            group.total += 1
            group.severity[severity] += 1

            details.push({
                id: extractVulnerabilityId(vulnerability),
                title: extractTitle(vulnerability),
                severity,
                source,
                packageName: extractPackageName(vulnerability),
                packageType: extractPackageType(vulnerability),
                installedVersion: extractInstalledVersion(vulnerability),
                fixedVersion: extractFixedVersion(vulnerability),
                description: extractDescription(vulnerability),
                references: extractReferences(vulnerability),
            })
        }

        return {
            image,
            scannedAt,
            totalVulnerabilities: vulnerabilities.length,
            severity: totalSeverity,
            groups: Array.from(grouped.values()).sort((a, b) => b.total - a.total),
            vulnerabilities: sortVulnerabilityDetails(details),
            scanError: null,
        }
    } catch (error: any) {
        return {
            image,
            scannedAt,
            totalVulnerabilities: 0,
            severity: emptySeverityCount(),
            groups: [],
            vulnerabilities: [],
            scanError: formatScanError(error),
        }
    } finally {
        await fs.rm(reportPath, { force: true }).catch(() => undefined)
    }
}

async function loadTrivyPayload(reportPath: string) {
    const filePayload = await tryReadJsonFile(reportPath)
    if (filePayload) {
        return filePayload
    }

    throw new Error(`Vulnerability scanner did not produce a readable JSON report at ${reportPath}`)
}

async function tryReadJsonFile(filePath: string) {
    try {
        const content = await fs.readFile(filePath, 'utf8')
        return JSON.parse(content)
    } catch {
        return null
    }
}
