import { ensureInternalSchema, getDbClient, query } from '#db'
import getUniqueRunningImages from './getUniqueRunningImages.ts'
import isDockerScoutLimitedError from './isDockerScoutLimitedError.ts'
import isDockerScoutUpdateNotice from './isDockerScoutUpdateNotice.ts'
import pruneStaleImages from './pruneStaleImages.ts'

const EMPTY_REPORT: VulnerabilityReportFile = {
    generatedAt: null,
    imageCount: 0,
    images: [],
}

const EMPTY_STATUS: DockerScoutScanStatus = {
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

const SCOUT_UNAVAILABLE_NOTE = 'Docker Scout is unavailable for this image. Showing Trivy results when available.'

type ReportRow = {
    generated_at: Date | string | null
    image_count: number
}

type ImageRow = {
    image: string
    scanned_at: Date | string
    total_vulnerabilities: number
    severity: SeverityCount
    groups: VulnerabilityGroup[]
    vulnerabilities: VulnerabilityDetail[]
    scanner_results: VulnerabilityScannerResult[]
    scan_error: string | null
}

type StatusRow = {
    is_running: boolean
    started_at: Date | string | null
    finished_at: Date | string | null
    last_success_at: Date | string | null
    last_error: string | null
    total_images: number | null
    completed_images: number
    current_image: string | null
    estimated_completion_at: Date | string | null
}

export async function loadStoredVulnerabilityReport(): Promise<VulnerabilityReportFile> {
    await ensureInternalSchema()

    const report = await query<ReportRow>(
        'SELECT generated_at, image_count FROM vulnerability_reports WHERE id = 1'
    )
    if (!report.rows[0]?.generated_at) {
        return EMPTY_REPORT
    }

    const images = await query<ImageRow>(`
        SELECT image,
               scanned_at,
               total_vulnerabilities,
               severity,
               groups,
               vulnerabilities,
               scanner_results,
               scan_error
        FROM vulnerability_report_images
        ORDER BY total_vulnerabilities DESC, image ASC
    `)

    const normalizedImages = images.rows.map(normalizeImageRow)
    const runningImages = await getUniqueRunningImages().catch(() => null)
    const activeImages = runningImages
        ? await pruneStaleImages(normalizedImages, runningImages)
        : normalizedImages

    return {
        generatedAt: toIso(report.rows[0].generated_at),
        imageCount: activeImages.length,
        images: activeImages,
    }
}

function normalizeImageRow(row: ImageRow): ImageVulnerabilityReport {
    const scannerResults = Array.isArray(row.scanner_results)
        ? row.scanner_results.map(normalizeScannerResult)
        : []

    return {
        image: row.image,
        scannedAt: toIso(row.scanned_at) || new Date().toISOString(),
        totalVulnerabilities: Number(row.total_vulnerabilities || 0),
        severity: row.severity,
        groups: Array.isArray(row.groups) ? row.groups : [],
        vulnerabilities: Array.isArray(row.vulnerabilities) ? row.vulnerabilities : [],
        scannerResults,
        scanError: normalizeImageScanError(row.scan_error),
    }
}

function normalizeScannerResult(result: VulnerabilityScannerResult): VulnerabilityScannerResult {
    if (result.scanner !== 'docker_scout') {
        return result
    }

    if (!isDockerScoutLimitedError(result.scanError || result.note || '')
        && !isDockerScoutUpdateNotice(result.scanError || result.note || '')) {
        return result
    }

    if (isDockerScoutUpdateNotice(result.scanError || result.note || '')) {
        return {
            ...result,
            scanError: null,
            summaryOnly: true,
            note: null,
        }
    }

    return {
        ...result,
        scanError: null,
        summaryOnly: true,
        note: SCOUT_UNAVAILABLE_NOTE,
    }
}

function normalizeImageScanError(scanError: string | null) {
    if (!scanError) {
        return null
    }

    const errors = scanError
        .split('|')
        .map((error) => error.trim())
        .filter((error) => error && !isDockerScoutLimitedError(error) && !isDockerScoutUpdateNotice(error))

    return errors.length ? errors.join(' | ') : null
}

export async function saveVulnerabilityReport(report: VulnerabilityReportFile) {
    await ensureInternalSchema()

    const client = await getDbClient()
    try {
        await client.query('BEGIN')
        await client.query('DELETE FROM vulnerability_report_images')
        for (const image of report.images) {
            await client.query(`
                INSERT INTO vulnerability_report_images (
                    image,
                    scanned_at,
                    total_vulnerabilities,
                    severity,
                    groups,
                    vulnerabilities,
                    scanner_results,
                    scan_error
                )
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
            `, [
                image.image,
                image.scannedAt,
                image.totalVulnerabilities,
                JSON.stringify(image.severity),
                JSON.stringify(image.groups),
                JSON.stringify(image.vulnerabilities),
                JSON.stringify(image.scannerResults || []),
                image.scanError,
            ])
        }

        await client.query(`
            INSERT INTO vulnerability_reports (id, generated_at, image_count, updated_at)
            VALUES (1, $1, $2, now())
            ON CONFLICT (id) DO UPDATE SET
                generated_at = EXCLUDED.generated_at,
                image_count = EXCLUDED.image_count,
                updated_at = now()
        `, [report.generatedAt, report.imageCount])
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
    } finally {
        client.release()
    }
}

export async function saveVulnerabilityImageResult(image: ImageVulnerabilityReport) {
    await ensureInternalSchema()

    await query(`
        INSERT INTO vulnerability_report_images (
            image,
            scanned_at,
            total_vulnerabilities,
            severity,
            groups,
            vulnerabilities,
            scanner_results,
            scan_error
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
        ON CONFLICT (image) DO UPDATE SET
            scanned_at = EXCLUDED.scanned_at,
            total_vulnerabilities = EXCLUDED.total_vulnerabilities,
            severity = EXCLUDED.severity,
            groups = EXCLUDED.groups,
            vulnerabilities = EXCLUDED.vulnerabilities,
            scanner_results = EXCLUDED.scanner_results,
            scan_error = EXCLUDED.scan_error
    `, [
        image.image,
        image.scannedAt,
        image.totalVulnerabilities,
        JSON.stringify(image.severity),
        JSON.stringify(image.groups),
        JSON.stringify(image.vulnerabilities),
        JSON.stringify(image.scannerResults || []),
        image.scanError,
    ])
}

export async function loadStoredVulnerabilityScanStatus(): Promise<DockerScoutScanStatus> {
    await ensureInternalSchema()

    const status = await query<StatusRow>(`
        SELECT is_running,
               started_at,
               finished_at,
               last_success_at,
               last_error,
               total_images,
               completed_images,
               current_image,
               estimated_completion_at
        FROM vulnerability_scan_status
        WHERE id = 1
    `)
    const row = status.rows[0]
    if (!row) {
        return { ...EMPTY_STATUS }
    }

    const normalizedStatus = {
        isRunning: false,
        startedAt: toIso(row.started_at),
        finishedAt: toIso(row.finished_at),
        lastSuccessAt: toIso(row.last_success_at),
        lastError: row.last_error,
        totalImages: row.total_images,
        completedImages: Number(row.completed_images || 0),
        currentImage: null,
        estimatedCompletionAt: null,
    }

    const healedStatus = await healStoredScanStatus(normalizedStatus)
    if (healedStatus !== normalizedStatus) {
        await saveVulnerabilityScanStatus(healedStatus)
    }

    return healedStatus
}

export async function saveVulnerabilityScanStatus(status: DockerScoutScanStatus) {
    await ensureInternalSchema()

    await query(`
        INSERT INTO vulnerability_scan_status (
            id,
            is_running,
            started_at,
            finished_at,
            last_success_at,
            last_error,
            total_images,
            completed_images,
            current_image,
            estimated_completion_at,
            updated_at
        )
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (id) DO UPDATE SET
            is_running = EXCLUDED.is_running,
            started_at = EXCLUDED.started_at,
            finished_at = EXCLUDED.finished_at,
            last_success_at = EXCLUDED.last_success_at,
            last_error = EXCLUDED.last_error,
            total_images = EXCLUDED.total_images,
            completed_images = EXCLUDED.completed_images,
            current_image = EXCLUDED.current_image,
            estimated_completion_at = EXCLUDED.estimated_completion_at,
            updated_at = now()
    `, [
        status.isRunning,
        status.startedAt,
        status.finishedAt,
        status.lastSuccessAt,
        status.lastError,
        status.totalImages,
        status.completedImages,
        status.currentImage,
        status.estimatedCompletionAt,
    ])
}

function toIso(value: Date | string | null | undefined) {
    if (!value) {
        return null
    }

    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function healStoredScanStatus(status: DockerScoutScanStatus) {
    if (
        status.isRunning
        || status.finishedAt
        || !status.startedAt
    ) {
        return status
    }

    const report = await query<ReportRow>(
        'SELECT generated_at, image_count FROM vulnerability_reports WHERE id = 1'
    )
    const generatedAt = toIso(report.rows[0]?.generated_at)
    if (!generatedAt || generatedAt < status.startedAt) {
        return {
            ...status,
            finishedAt: status.startedAt,
            lastError: status.lastError || 'Scan was interrupted before it finished.',
        }
    }

    const totalImages = Math.max(
        status.totalImages || 0,
        Number(report.rows[0]?.image_count || 0),
        status.completedImages
    )

    return {
        ...status,
        finishedAt: generatedAt,
        lastSuccessAt: generatedAt,
        totalImages,
        completedImages: totalImages,
    }
}
