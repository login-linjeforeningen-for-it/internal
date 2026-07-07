import { ensureInternalSchema, getDbClient, query } from '#db'

const EMPTY_REPORT: VulnerabilityReportFile = { generatedAt: null, imageCount: 0, images: [] }

const EMPTY_STATUS: DockerScoutScanStatus = {
    isRunning: false, startedAt: null, finishedAt: null, lastSuccessAt: null,
    lastError: null, totalImages: null, completedImages: 0, currentImage: null, estimatedCompletionAt: null,
}

export async function loadReport(): Promise<VulnerabilityReportFile> {
    await ensureInternalSchema()

    const { rows: [meta] } = await query<{ generated_at: string | null }>(
        'SELECT generated_at FROM vulnerability_reports WHERE id = 1'
    )
    if (!meta?.generated_at) return EMPTY_REPORT

    const { rows } = await query<{
        image: string
        scanned_at: string
        total_vulnerabilities: number
        severity: SeverityCount
        groups: VulnerabilityGroup[]
        vulnerabilities: VulnerabilityDetail[]
        scanner_results: VulnerabilityScannerResult[]
        scan_error: string | null
    }>(
        'SELECT image, scanned_at, total_vulnerabilities, severity, groups, vulnerabilities, scanner_results, scan_error FROM vulnerability_report_images ORDER BY total_vulnerabilities DESC, image ASC'
    )

    const images = rows.map(r => ({
        image: r.image,
        scannedAt: r.scanned_at,
        totalVulnerabilities: Number(r.total_vulnerabilities),
        severity: r.severity,
        groups: r.groups ?? [],
        vulnerabilities: r.vulnerabilities ?? [],
        scannerResults: r.scanner_results ?? [],
        scanError: r.scan_error,
    }))

    return { generatedAt: toIso(meta.generated_at), imageCount: images.length, images }
}

export async function saveImageResult(image: ImageVulnerabilityReport) {
    await ensureInternalSchema()
    await query(`
        INSERT INTO vulnerability_report_images
            (image, scanned_at, total_vulnerabilities, severity, groups, vulnerabilities, scanner_results, scan_error)
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
        image.image, image.scannedAt, image.totalVulnerabilities,
        JSON.stringify(image.severity), JSON.stringify(image.groups),
        JSON.stringify(image.vulnerabilities), JSON.stringify(image.scannerResults ?? []),
        image.scanError,
    ])
}

export async function saveReport(report: VulnerabilityReportFile) {
    await ensureInternalSchema()
    const client = await getDbClient()
    try {
        await client.query('BEGIN')
        await client.query('DELETE FROM vulnerability_report_images')
        for (const image of report.images) {
            await client.query(`
                INSERT INTO vulnerability_report_images
                    (image, scanned_at, total_vulnerabilities, severity, groups, vulnerabilities, scanner_results, scan_error)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
            `, [
                image.image, image.scannedAt, image.totalVulnerabilities,
                JSON.stringify(image.severity), JSON.stringify(image.groups),
                JSON.stringify(image.vulnerabilities), JSON.stringify(image.scannerResults ?? []),
                image.scanError,
            ])
        }
        await client.query(`
            INSERT INTO vulnerability_reports (id, generated_at, image_count, updated_at)
            VALUES (1, $1, $2, now())
            ON CONFLICT (id) DO UPDATE SET generated_at = EXCLUDED.generated_at, image_count = EXCLUDED.image_count, updated_at = now()
        `, [report.generatedAt, report.imageCount])
        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw e
    } finally {
        client.release()
    }
}

export async function loadScanStatus(): Promise<DockerScoutScanStatus> {
    await ensureInternalSchema()
    const { rows: [row] } = await query<{
        is_running: boolean
        started_at: string | null
        finished_at: string | null
        last_success_at: string | null
        last_error: string | null
        total_images: number | null
        completed_images: number
        current_image: string | null
        estimated_completion_at: string | null
    }>('SELECT is_running, started_at, finished_at, last_success_at, last_error, total_images, completed_images, current_image, estimated_completion_at FROM vulnerability_scan_status WHERE id = 1')

    if (!row) return { ...EMPTY_STATUS }

    return {
        isRunning: false,
        startedAt: toIso(row.started_at),
        finishedAt: toIso(row.finished_at ?? row.started_at),
        lastSuccessAt: toIso(row.last_success_at),
        lastError: row.last_error,
        totalImages: row.total_images,
        completedImages: Number(row.completed_images),
        currentImage: null,
        estimatedCompletionAt: null,
    }
}

export async function saveScanStatus(status: DockerScoutScanStatus) {
    await ensureInternalSchema()
    await query(`
        INSERT INTO vulnerability_scan_status
            (id, is_running, started_at, finished_at, last_success_at, last_error, total_images, completed_images, current_image, estimated_completion_at, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (id) DO UPDATE SET
            is_running = EXCLUDED.is_running, started_at = EXCLUDED.started_at,
            finished_at = EXCLUDED.finished_at, last_success_at = EXCLUDED.last_success_at,
            last_error = EXCLUDED.last_error, total_images = EXCLUDED.total_images,
            completed_images = EXCLUDED.completed_images, current_image = EXCLUDED.current_image,
            estimated_completion_at = EXCLUDED.estimated_completion_at, updated_at = now()
    `, [
        status.isRunning, status.startedAt, status.finishedAt, status.lastSuccessAt,
        status.lastError, status.totalImages, status.completedImages,
        status.currentImage, status.estimatedCompletionAt,
    ])
}

export async function loadScoutAlertState(): Promise<{ lastAlertedAt: string | null, npmVulnIds: Set<string> }> {
    await ensureInternalSchema()
    const { rows: [row] } = await query<{ last_alerted_at: string | null, last_alerted_npm_vuln_ids: string[] }>(
        'SELECT last_alerted_at, last_alerted_npm_vuln_ids FROM vulnerability_reports WHERE id = 1'
    )
    return {
        lastAlertedAt: toIso(row?.last_alerted_at),
        npmVulnIds: new Set(row?.last_alerted_npm_vuln_ids ?? []),
    }
}

export async function saveScoutAlertState(npmVulnIds: Set<string>): Promise<void> {
    await ensureInternalSchema()
    await query(`
        INSERT INTO vulnerability_reports (id, last_alerted_at, last_alerted_npm_vuln_ids)
        VALUES (1, now(), $1::jsonb)
        ON CONFLICT (id) DO UPDATE SET
            last_alerted_at = now(),
            last_alerted_npm_vuln_ids = EXCLUDED.last_alerted_npm_vuln_ids
    `, [JSON.stringify([...npmVulnIds])])
}

function toIso(value: Date | string | null | undefined): string | null {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    return isNaN(d.getTime()) ? null : d.toISOString()
}
