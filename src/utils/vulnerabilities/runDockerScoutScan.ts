import getEstimatedCompletionAt from './getEstimatedCompletionAt.ts'
import getUniqueRunningImages from './getUniqueRunningImages.ts'
import scanImage from './scanImage.ts'
import { vulnerabilityScanRuntime } from './runtime.ts'
import { saveVulnerabilityImageResult, saveVulnerabilityReport, saveVulnerabilityScanStatus } from './storage.ts'

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
    await saveVulnerabilityScanStatus(vulnerabilityScanRuntime.scanStatus)

    for (const image of images) {
        vulnerabilityScanRuntime.scanStatus = {
            ...vulnerabilityScanRuntime.scanStatus,
            currentImage: image,
            estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
                ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, vulnerabilityScanRuntime.scanStatus.completedImages, images.length)
                : null,
        }
        await saveVulnerabilityScanStatus(vulnerabilityScanRuntime.scanStatus)

        const result = await scanImage(image)
        scanned.push(result)
        await saveVulnerabilityImageResult(result)

        vulnerabilityScanRuntime.scanStatus = {
            ...vulnerabilityScanRuntime.scanStatus,
            completedImages: scanned.length,
            currentImage: scanned.length < images.length ? images[scanned.length] : null,
            estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
                ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, scanned.length, images.length)
                : null,
        }
        await saveVulnerabilityScanStatus(vulnerabilityScanRuntime.scanStatus)
    }

    const report: VulnerabilityReportFile = {
        generatedAt: new Date().toISOString(),
        imageCount: images.length,
        images: scanned,
    }

    await saveVulnerabilityReport(report)

    return report
}
