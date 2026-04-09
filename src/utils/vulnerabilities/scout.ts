import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import config from '#config'

const execAsync = promisify(exec)

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

type SeverityCount = Record<SeverityLevel, number>

export interface VulnerabilityGroup {
    source: string
    total: number
    severity: SeverityCount
}

export interface VulnerabilityDetail {
    id: string
    title: string
    severity: SeverityLevel
    source: string
    packageName: string | null
    packageType: string | null
    installedVersion: string | null
    fixedVersion: string | null
    description: string | null
    references: string[]
}

export interface ImageVulnerabilityReport {
    image: string
    scannedAt: string
    totalVulnerabilities: number
    severity: SeverityCount
    groups: VulnerabilityGroup[]
    vulnerabilities: VulnerabilityDetail[]
    scanError: string | null
}

export interface VulnerabilityReportFile {
    generatedAt: string | null
    imageCount: number
    images: ImageVulnerabilityReport[]
}

export interface DockerScoutScanStatus {
    isRunning: boolean
    startedAt: string | null
    finishedAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    totalImages: number | null
    completedImages: number
    currentImage: string | null
    estimatedCompletionAt: string | null
}

let activeScan: Promise<VulnerabilityReportFile> | null = null
let scanStatus: DockerScoutScanStatus = {
    isRunning: false,
    startedAt: null,
    finishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    totalImages: null,
    completedImages: 0,
    currentImage: null,
    estimatedCompletionAt: null,
}

function getEstimatedCompletionAt(startedAt: string, completedImages: number, totalImages: number): string | null {
    if (completedImages <= 0 || totalImages <= 0 || completedImages >= totalImages) {
        return null
    }

    const startedAtMs = new Date(startedAt).getTime()
    const nowMs = Date.now()
    const elapsedMs = nowMs - startedAtMs
    if (elapsedMs <= 0) {
        return null
    }

    const averagePerImageMs = elapsedMs / completedImages
    const remainingImages = totalImages - completedImages

    return new Date(nowMs + averagePerImageMs * remainingImages).toISOString()
}

function emptySeverityCount(): SeverityCount {
    return {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0
    }
}

function shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
}

function normalizeSeverity(value: unknown): SeverityLevel {
    if (typeof value !== 'string') {
        return 'unknown'
    }

    const normalized = value.toLowerCase()

    if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
        return normalized
    }

    return 'unknown'
}

function extractSeverity(vulnerability: any): SeverityLevel {
    const candidates = [
        vulnerability?.severity,
        vulnerability?.vulnerability?.severity,
        vulnerability?.cvss?.severity,
        vulnerability?.cvssV3?.severity
    ]

    const firstKnown = candidates
        .map(normalizeSeverity)
        .find((severity) => severity !== 'unknown')

    return firstKnown ?? normalizeSeverity(candidates[0])
}

function normalizeSourceLabel(raw: string): string {
    return raw.trim().toLowerCase()
}

function firstString(values: unknown[]): string | null {
    const candidate = values.find((value) => typeof value === 'string' && value.trim().length > 0)
    return typeof candidate === 'string' ? candidate : null
}

function sourceFromPathLikeValue(value: string): string {
    const normalized = value.trim().replace(/\\/g, '/')
    const basename = path.posix.basename(normalized)
    return normalizeSourceLabel(basename || normalized)
}

function sourceFromPurl(purl: string): string {
    const match = /^pkg:([^/]+)/i.exec(purl.trim())
    if (!match) {
        return 'unknown'
    }

    const packageType = normalizeSourceLabel(match[1])
    return `dependency:${packageType}`
}

function firstLine(value: unknown): string {
    if (typeof value !== 'string') {
        return ''
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed.split('\n')[0] : ''
}

function formatScanError(error: any): string {
    const stderr = firstLine(error?.stderr)
    if (stderr) {
        return stderr
    }

    const stdout = firstLine(error?.stdout)
    if (stdout) {
        return stdout
    }

    const message = firstLine(error?.message)
    if (message.toLowerCase().startsWith('command failed:')) {
        return 'Docker Scout scan command failed'
    }

    return message || 'Docker Scout scan failed'
}

function extractSource(vulnerability: any): string {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}
    const locationObject = vulnerability?.location || {}
    const dependencyObject = locationObject?.dependency || {}
    const dependencyPackageObject = dependencyObject?.package || {}

    const purl = firstString([packageObject?.purl, vulnerability?.purl])
    const dependencyIdentifier = firstString([dependencyPackageObject?.name, dependencyObject?.name])

    if (dependencyIdentifier?.startsWith('pkg:')) {
        const dependencySource = sourceFromPurl(dependencyIdentifier)
        if (dependencySource !== 'unknown') {
            return dependencySource
        }
    }

    if (purl) {
        const purlSource = sourceFromPurl(purl)
        if (purlSource !== 'unknown') {
            return purlSource
        }
    }

    const pathLike = firstString([
        locationObject?.path,
        locationObject?.file,
        locationObject?.operating_system,
        packageObject?.location,
        packageObject?.path,
        packageObject?.source,
        dependencyPackageObject?.name,
        vulnerability?.source,
        vulnerability?.sourceName,
        vulnerability?.origin
    ])

    if (pathLike) {
        return sourceFromPathLikeValue(pathLike)
    }

    const packageType = firstString([
        packageObject?.ecosystem,
        packageObject?.type,
        packageObject?.manager,
        vulnerability?.ecosystem,
        vulnerability?.packageType
    ])

    if (packageType) {
        return `dependency:${normalizeSourceLabel(packageType)}`
    }

    const classifier = firstString([
        packageObject?.kind,
        vulnerability?.kind,
        vulnerability?.class,
        vulnerability?.category,
        vulnerability?.type
    ])

    return 'unknown'
}

function extractVulnerabilityId(vulnerability: any): string {
    return firstString([
        vulnerability?.id,
        vulnerability?.vulnerability?.id,
        vulnerability?.cve,
        vulnerability?.advisory,
        vulnerability?.name,
    ]) || 'unknown'
}

function extractTitle(vulnerability: any): string {
    return firstString([
        vulnerability?.title,
        vulnerability?.name,
        vulnerability?.message,
        vulnerability?.description,
        vulnerability?.summary,
        vulnerability?.vulnerability?.summary,
        vulnerability?.vulnerability?.description,
        extractVulnerabilityId(vulnerability),
    ]) || 'Untitled vulnerability'
}

function extractPackageName(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}
    const locationObject = vulnerability?.location || {}
    const dependencyObject = locationObject?.dependency || {}
    const dependencyPackageObject = dependencyObject?.package || {}

    return firstString([
        packageObject?.name,
        packageObject?.package_name,
        dependencyPackageObject?.name,
        dependencyObject?.name,
        vulnerability?.packageName,
        vulnerability?.package,
    ])
}

function extractPackageType(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}

    return firstString([
        packageObject?.ecosystem,
        packageObject?.type,
        packageObject?.manager,
        vulnerability?.ecosystem,
        vulnerability?.packageType,
    ])
}

function extractInstalledVersion(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}

    return firstString([
        packageObject?.version,
        packageObject?.installedVersion,
        vulnerability?.installedVersion,
        vulnerability?.version,
    ])
}

function extractFixedVersion(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}
    const fixObject = vulnerability?.fix || vulnerability?.fixedIn || {}

    return firstString([
        vulnerability?.fixedVersion,
        fixObject?.version,
        fixObject?.versions?.[0],
        packageObject?.fixedVersion,
        Array.isArray(vulnerability?.fixedVersion) ? vulnerability.fixedVersion[0] : null,
    ])
}

function extractDescription(vulnerability: any): string | null {
    return firstString([
        vulnerability?.description,
        vulnerability?.summary,
        vulnerability?.message,
        vulnerability?.vulnerability?.description,
        vulnerability?.vulnerability?.summary,
    ])
}

function extractReferences(vulnerability: any): string[] {
    const references = [
        ...(Array.isArray(vulnerability?.links) ? vulnerability.links : []),
        ...(Array.isArray(vulnerability?.references) ? vulnerability.references : []),
        ...(Array.isArray(vulnerability?.urls) ? vulnerability.urls : []),
    ]

    return Array.from(new Set(
        references.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    )).slice(0, 5)
}

function collectVulnerabilities(raw: any): any[] {
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.vulnerabilities)) return raw.vulnerabilities
    if (Array.isArray(raw?.matches)) {
        return raw.matches.map((match: any) => match?.vulnerability ?? match).filter(Boolean)
    }
    if (Array.isArray(raw?.results)) return raw.results.flatMap((result: any) => collectVulnerabilities(result))
    if (Array.isArray(raw?.artifacts)) return raw.artifacts.flatMap((artifact: any) => collectVulnerabilities(artifact))
    return []
}

async function getUniqueRunningImages(): Promise<string[]> {
    const { stdout } = await execAsync('docker ps --format "{{.Image}}"')
    const images = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

    return Array.from(new Set(images)).sort((a, b) => a.localeCompare(b))
}

async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const scannedAt = new Date().toISOString()
    const reportDir = path.join(process.cwd(), 'data', 'tmp')
    const reportName = `scout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    const reportPath = path.join(reportDir, reportName)

    try {
        await fs.mkdir(reportDir, { recursive: true })

        await execAsync(
            `docker scout cves ${shellEscape(image)} --format gitlab --output ${shellEscape(reportPath)}`,
            { maxBuffer: 20 * 1024 * 1024 }
        )

        const rawReport = await fs.readFile(reportPath, 'utf8')
        const parsed = JSON.parse(rawReport)
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
                    severity: emptySeverityCount()
                })
            }

            const group = grouped.get(source)
            if (!group) continue

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

        const groups = Array.from(grouped.values()).sort((a, b) => b.total - a.total)
        const sortedDetails = details.sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }
            return severityOrder[a.severity] - severityOrder[b.severity]
        })

        return {
            image,
            scannedAt,
            totalVulnerabilities: vulnerabilities.length,
            severity: totalSeverity,
            groups,
            vulnerabilities: sortedDetails,
            scanError: null
        }
    } catch (error: any) {
        return {
            image,
            scannedAt,
            totalVulnerabilities: 0,
            severity: emptySeverityCount(),
            groups: [],
            vulnerabilities: [],
            scanError: formatScanError(error)
        }
    } finally {
        await fs.rm(reportPath, { force: true }).catch(() => undefined)
    }
}

export function getDockerScoutScanStatus(): DockerScoutScanStatus {
    return { ...scanStatus }
}

export function triggerDockerScoutScanInBackground(): {
    started: boolean
    status: DockerScoutScanStatus
} {
    if (activeScan) {
        return {
            started: false,
            status: getDockerScoutScanStatus()
        }
    }

    const startedAt = new Date().toISOString()
    scanStatus = {
        ...scanStatus,
        isRunning: true,
        startedAt,
        finishedAt: null,
        lastError: null,
        totalImages: null,
        completedImages: 0,
        currentImage: null,
        estimatedCompletionAt: null,
    }

    activeScan = runDockerScoutScan()
        .then((report) => {
            scanStatus = {
                ...scanStatus,
                lastSuccessAt: report.generatedAt,
                lastError: null,
                currentImage: null,
                estimatedCompletionAt: null,
            }
            return report
        })
        .catch((error: any) => {
            scanStatus = {
                ...scanStatus,
                lastError: formatScanError(error),
                currentImage: null,
                estimatedCompletionAt: null,
            }
            throw error
        })
        .finally(() => {
            scanStatus = {
                ...scanStatus,
                isRunning: false,
                finishedAt: new Date().toISOString(),
                currentImage: null,
            }
            activeScan = null
        })

    return {
        started: true,
        status: getDockerScoutScanStatus()
    }
}

export async function loadVulnerabilityReport(): Promise<VulnerabilityReportFile> {
    try {
        const content = await fs.readFile(config.vulnerability.path, 'utf8')
        const parsed = JSON.parse(content) as VulnerabilityReportFile
        return {
            ...parsed,
            images: Array.isArray(parsed.images)
                ? parsed.images.map((image) => ({
                    ...image,
                    vulnerabilities: Array.isArray(image.vulnerabilities) ? image.vulnerabilities : []
                }))
                : []
        }
    } catch {
        return {
            generatedAt: null,
            imageCount: 0,
            images: []
        }
    }
}

export async function runDockerScoutScan(): Promise<VulnerabilityReportFile> {
    const images = await getUniqueRunningImages()
    const scanned: ImageVulnerabilityReport[] = []

    scanStatus = {
        ...scanStatus,
        totalImages: images.length,
        completedImages: 0,
        currentImage: images[0] || null,
        estimatedCompletionAt: null,
    }

    for (const image of images) {
        scanStatus = {
            ...scanStatus,
            currentImage: image,
            estimatedCompletionAt: scanStatus.startedAt
                ? getEstimatedCompletionAt(scanStatus.startedAt, scanStatus.completedImages, images.length)
                : null,
        }

        const result = await scanImage(image)
        scanned.push(result)

        scanStatus = {
            ...scanStatus,
            completedImages: scanned.length,
            currentImage: scanned.length < images.length ? images[scanned.length] : null,
            estimatedCompletionAt: scanStatus.startedAt
                ? getEstimatedCompletionAt(scanStatus.startedAt, scanned.length, images.length)
                : null,
        }
    }

    const report: VulnerabilityReportFile = {
        generatedAt: new Date().toISOString(),
        imageCount: images.length,
        images: scanned
    }

    await fs.mkdir(path.dirname(config.vulnerability.path), { recursive: true })
    await fs.writeFile(config.vulnerability.path, JSON.stringify(report, null, 2), 'utf8')

    return report
}
