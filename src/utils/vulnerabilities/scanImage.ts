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
    const reportName = `scout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    const reportPath = path.join(reportDir, reportName)

    try {
        await fs.mkdir(reportDir, { recursive: true })

        const primary = await execAsync(
            `docker scout cves --format gitlab --output ${shellEscape(reportPath)} ${shellEscape(image)}`,
            { maxBuffer: 20 * 1024 * 1024 }
        )

        const parsed = await loadScoutPayload(image, reportPath, primary.stdout)
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

async function loadScoutPayload(image: string, reportPath: string, stdout: string) {
    const filePayload = await tryReadJsonFile(reportPath)
    if (filePayload) {
        return filePayload
    }

    const stdoutPayload = tryParseJson(stdout)
    if (stdoutPayload) {
        return stdoutPayload
    }

    const fallback = await execAsync(
        `docker scout cves --format gitlab ${shellEscape(image)}`,
        { maxBuffer: 20 * 1024 * 1024 }
    ).catch(() => null)

    const fallbackPayload = tryParseJson(fallback?.stdout || '')
    if (fallbackPayload) {
        return fallbackPayload
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

function tryParseJson(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
        return null
    }

    try {
        return JSON.parse(trimmed)
    } catch {
        return null
    }
}
