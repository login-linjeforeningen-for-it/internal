import fs from 'fs/promises'
import path from 'path'
import config from '#config'
import getEstimatedCompletionAt from './getEstimatedCompletionAt.ts'
import getUniqueRunningImages from './getUniqueRunningImages.ts'
import scanImage from './scanImage.ts'
import { vulnerabilityScanRuntime } from './runtime.ts'

export default async function runDockerScoutScan(): Promise<VulnerabilityReportFile> {
    const images = await getUniqueRunningImages()
    const scanned: ImageVulnerabilityReport[] = []

    vulnerabilityScanRuntime.scanStatus = {
        ...vulnerabilityScanRuntime.scanStatus,
        totalImages: images.length,
        completedImages: 0,
        currentImage: images[0] || null,
        estimatedCompletionAt: null,
    }

    for (const image of images) {
        vulnerabilityScanRuntime.scanStatus = {
            ...vulnerabilityScanRuntime.scanStatus,
            currentImage: image,
            estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
                ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, vulnerabilityScanRuntime.scanStatus.completedImages, images.length)
                : null,
        }

        const result = await scanImage(image)
        scanned.push(result)

        vulnerabilityScanRuntime.scanStatus = {
            ...vulnerabilityScanRuntime.scanStatus,
            completedImages: scanned.length,
            currentImage: scanned.length < images.length ? images[scanned.length] : null,
            estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
                ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, scanned.length, images.length)
                : null,
        }
    }

    const report: VulnerabilityReportFile = {
        generatedAt: new Date().toISOString(),
        imageCount: images.length,
        images: scanned,
    }

    await fs.mkdir(path.dirname(config.vulnerability.path), { recursive: true })
    await fs.writeFile(config.vulnerability.path, JSON.stringify(report, null, 2), 'utf8')

    return report
}
