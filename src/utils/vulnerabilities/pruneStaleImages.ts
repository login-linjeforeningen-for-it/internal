import { getDbClient } from '#db'

export default async function pruneStaleImages(images: ImageVulnerabilityReport[], runningImages: string[]) {
    const allowed = new Set(runningImages)
    const filtered = images.filter((image) => allowed.has(image.image))

    if (filtered.length === images.length) {
        return filtered
    }

    const client = await getDbClient()
    try {
        await client.query('BEGIN')
        await client.query('DELETE FROM vulnerability_report_images WHERE NOT (image = ANY($1::text[]))', [runningImages])
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
