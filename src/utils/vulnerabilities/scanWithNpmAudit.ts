import fs from 'fs'
import path from 'path'
import { execFileSync, execSync } from 'child_process'
import buildGroupBreakdown from './buildGroupBreakdown.ts'
import emptySeverityCount from './emptySeverityCount.ts'
import formatScanError from './formatScanError.ts'
import sortVulnerabilityDetails from './sortVulnerabilityDetails.ts'

const PROJECT_ROOT = path.resolve(process.env.SCOUTERBEE_PROJECT_ROOT || process.env.DEPLOY_ROOT || '/workspace')
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'build', 'dist', 'node_modules'])
const MAX_SEARCH_DEPTH = 4

type ScannerImageReport = Omit<ImageVulnerabilityReport, 'image' | 'scannedAt' | 'totalVulnerabilities' | 'scannerResults' | 'scanError'>
    & VulnerabilityScannerResult

type PackageFolder = {
    directory: string
    name: string | null
    relativePath: string
}

type NpmAuditMetadata = {
    vulnerabilities?: Partial<Record<'info' | 'low' | 'moderate' | 'high' | 'critical' | 'total', number>>
}

type NpmAuditVia = {
    source?: string | number
    name?: string
    title?: string
    url?: string
    severity?: string
    range?: string
}

type NpmAuditVulnerability = {
    name?: string
    severity?: string
    via?: Array<NpmAuditVia | string>
    range?: string
    fixAvailable?: boolean | { version?: string, name?: string }
}

type NpmAuditReport = {
    auditReportVersion?: number
    metadata?: NpmAuditMetadata
    vulnerabilities?: Record<string, NpmAuditVulnerability>
}

export default async function scanWithNpmAudit(image: string): Promise<ScannerImageReport | null> {
    const scannedAt = new Date().toISOString()

    try {
        const project = findPackageFolderForImage(image)
        if (!project) {
            return buildSummaryOnly(scannedAt, 'No matching package.json folder was found for this running image.')
        }

        const report = runNpmAudit(project.directory)
        const severity = severityFromMetadata(report.metadata)
        const vulnerabilities = sortVulnerabilityDetails(buildVulnerabilityDetails(report, project))

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
    } catch (error) {
        return {
            scanner: 'npm_audit',
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

function buildSummaryOnly(scannedAt: string, note: string): ScannerImageReport {
    return {
        scanner: 'npm_audit',
        scannedAt,
        totalVulnerabilities: 0,
        severity: emptySeverityCount(),
        groups: [],
        vulnerabilities: [],
        scanError: null,
        summaryOnly: true,
        note,
    }
}

function findPackageFolderForImage(image: string) {
    const imageKeys = getImageMatchKeys(image)
    const folders = findPackageFolders(PROJECT_ROOT)
    const scored = folders
        .map((folder) => ({
            folder,
            score: Math.max(...imageKeys.map(({ key, bonus }) => {
                const score = getMatchScore(key, folder)
                return score > 0 ? score + bonus : 0
            })),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.folder.relativePath.localeCompare(right.folder.relativePath))

    return scored[0]?.folder || null
}

function getImageMatchKeys(image: string) {
    const seen = new Set<string>()
    const keys: Array<{ key: string, bonus: number }> = []
    for (const [value, bonus] of [
        [imageName(image), 0],
        ...getContainerNamesForImage(image).map((name) => [name, 25] as const),
    ] as const) {
        const key = normalizeKey(value)
        if (!key || seen.has(key)) continue
        seen.add(key)
        keys.push({ key, bonus })
    }

    return keys
}

function getContainerNamesForImage(image: string) {
    try {
        const output = execSync('docker ps --format "{{.Image}}|{{.Names}}"', {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
        })

        return output
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [containerImage, name] = line.split('|')
                return { containerImage, name }
            })
            .filter((entry) => entry.containerImage === image && entry.name)
            .map((entry) => entry.name)
    } catch {
        return []
    }
}

function getMatchScore(imageKey: string, folder: PackageFolder) {
    const nameKey = normalizeKey(folder.name || '')
    const folderKey = normalizeKey(path.basename(folder.directory))
    const pathKey = normalizeKey(folder.relativePath)

    if (imageKey === nameKey || imageKey === folderKey || imageKey === pathKey) return 100

    return 0
}

function findPackageFolders(root: string) {
    const folders: PackageFolder[] = []
    walkPackageFolders(root, '', 0, folders)
    return folders
}

function walkPackageFolders(root: string, relativePath: string, depth: number, folders: PackageFolder[]) {
    if (depth > MAX_SEARCH_DEPTH) return

    const directory = path.join(root, relativePath)
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
        return
    }

    if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) {
        folders.push({
            directory,
            relativePath,
            name: readPackageName(path.join(directory, 'package.json')),
        })
    }

    for (const entry of entries) {
        if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue
        walkPackageFolders(root, path.join(relativePath, entry.name), depth + 1, folders)
    }
}

function readPackageName(packageJsonPath: string) {
    try {
        const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string }
        return typeof parsed.name === 'string' ? parsed.name : null
    } catch {
        return null
    }
}

function runNpmAudit(directory: string): NpmAuditReport {
    try {
        const output = execFileSync('npm', ['audit', '--json'], {
            cwd: directory,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            timeout: 60_000,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        return parseAuditOutput(output)
    } catch (error) {
        const auditError = error as { stdout?: string | Buffer }
        if (!auditError.stdout) throw error
        return parseAuditOutput(Buffer.isBuffer(auditError.stdout) ? auditError.stdout.toString('utf8') : auditError.stdout)
    }
}

function parseAuditOutput(output: string): NpmAuditReport {
    if (!output.trim()) throw new Error('npm audit returned empty output.')
    return JSON.parse(output) as NpmAuditReport
}

function buildVulnerabilityDetails(report: NpmAuditReport, project: PackageFolder): VulnerabilityDetail[] {
    const vulnerabilities: VulnerabilityDetail[] = []
    const entries = Object.entries(report.vulnerabilities || {})

    for (const [packageName, vulnerability] of entries) {
        const advisories = (vulnerability.via || [])
            .filter((entry): entry is NpmAuditVia => typeof entry === 'object' && entry !== null)
        if (!advisories.length) {
            vulnerabilities.push(buildPackageVulnerability(packageName, vulnerability, project))
            continue
        }

        for (const advisory of advisories) {
            vulnerabilities.push(buildAdvisoryVulnerability(packageName, vulnerability, advisory, project))
        }
    }

    return vulnerabilities
}

function buildPackageVulnerability(packageName: string, vulnerability: NpmAuditVulnerability, project: PackageFolder): VulnerabilityDetail {
    return {
        id: `npm:${packageName}`,
        title: `${packageName} npm audit finding`,
        severity: normalizeAuditSeverity(vulnerability.severity),
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

function buildAdvisoryVulnerability(
    packageName: string,
    vulnerability: NpmAuditVulnerability,
    advisory: NpmAuditVia,
    project: PackageFolder
): VulnerabilityDetail {
    return {
        id: advisory.source ? `npm:${advisory.source}` : `npm:${packageName}`,
        title: advisory.title || `${packageName} npm audit finding`,
        severity: normalizeAuditSeverity(advisory.severity || vulnerability.severity),
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
    return typeof total === 'number' ? total : null
}

function normalizeAuditSeverity(value?: string): SeverityLevel {
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

function imageName(image: string) {
    const withoutDigest = image.split('@')[0]
    const withoutTag = withoutDigest.includes(':') ? withoutDigest.split(':').slice(0, -1).join(':') : withoutDigest
    return withoutTag.split('/').at(-1) || withoutTag
}

function normalizeKey(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}
