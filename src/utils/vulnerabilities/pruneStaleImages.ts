import { getDbClient } from '#db'

export default async function pruneStaleImages(images: ImageVulnerabilityReport[], runningImages: string[]) {
    const allowed = new Set(runningImages)
    const filtered = images.filter((image) => isActiveReportImage(image, allowed))

    if (filtered.length === images.length) {
        return filtered
    }

    const client = await getDbClient()
    try {
        await client.query('BEGIN')
        await client.query(`
            DELETE FROM vulnerability_report_images
            WHERE NOT (image = ANY($1::text[]))
              AND image NOT LIKE 'npm:%'
              AND NOT (scanner_results @> '[{"scanner":"npm_audit"}]'::jsonb)
        `, [runningImages])
        await client.query(
            `UPDATE vulnerability_reports
             SET image_count = $1,
                 updated_at = now()
             WHERE id = 1`,
            [filtered.length]
        )
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
    } finally {
        client.release()
    }

    return filtered
}

function isActiveReportImage(image: ImageVulnerabilityReport, allowed: Set<string>) {
    if (image.image.startsWith('npm:') || hasNpmAuditResult(image)) {
        return true
    }

    return allowed.has(image.image)
}

function hasNpmAuditResult(image: ImageVulnerabilityReport) {
    const results = image.scannerResults || []
    if (!results.length) {
        return false
    }

    return results.some((result) => result.scanner === 'npm_audit')
}
