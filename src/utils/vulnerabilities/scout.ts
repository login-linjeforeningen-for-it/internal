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

export interface ImageVulnerabilityReport {
    image: string
    scannedAt: string
    totalVulnerabilities: number
    severity: SeverityCount
    groups: VulnerabilityGroup[]
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
}

let activeScan: Promise<VulnerabilityReportFile> | null = null
let scanStatus: DockerScoutScanStatus = {
    isRunning: false,
    startedAt: null,
    finishedAt: null,
    lastSuccessAt: null,
    lastError: null
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
        }

        const groups = Array.from(grouped.values()).sort((a, b) => b.total - a.total)

        return {
            image,
            scannedAt,
            totalVulnerabilities: vulnerabilities.length,
            severity: totalSeverity,
            groups,
            scanError: null
        }
    } catch (error: any) {
        return {
            image,
            scannedAt,
            totalVulnerabilities: 0,
            severity: emptySeverityCount(),
            groups: [],
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
        lastError: null
    }

    activeScan = runDockerScoutScan()
        .then((report) => {
            scanStatus = {
                ...scanStatus,
                lastSuccessAt: report.generatedAt,
                lastError: null
            }
            return report
        })
        .catch((error: any) => {
            scanStatus = {
                ...scanStatus,
                lastError: formatScanError(error)
            }
            throw error
        })
        .finally(() => {
            scanStatus = {
                ...scanStatus,
                isRunning: false,
                finishedAt: new Date().toISOString()
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
        return JSON.parse(content) as VulnerabilityReportFile
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

    for (const image of images) {
        const result = await scanImage(image)
        scanned.push(result)
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
