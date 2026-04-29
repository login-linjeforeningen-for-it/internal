import getEstimatedCompletionAt from './getEstimatedCompletionAt.ts'
import getUniqueRunningImages from './getUniqueRunningImages.ts'
import scanImage from './scanImage.ts'
import { vulnerabilityScanRuntime } from './runtime.ts'
import { saveVulnerabilityImageResult, saveVulnerabilityReport, saveVulnerabilityScanStatus } from './storage.ts'

const STORAGE_RETRY_ATTEMPTS = 3

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
    await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)

    for (const image of images) {
        vulnerabilityScanRuntime.scanStatus = {
            ...vulnerabilityScanRuntime.scanStatus,
            currentImage: image,
            estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
                ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, vulnerabilityScanRuntime.scanStatus.completedImages, images.length)
                : null,
        }
        await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)

        const result = await scanImage(image)
        scanned.push(result)
        await saveWithRetry(() => saveVulnerabilityImageResult(result), `vulnerability image result for ${image}`)

        vulnerabilityScanRuntime.scanStatus = {
            ...vulnerabilityScanRuntime.scanStatus,
            completedImages: scanned.length,
            currentImage: scanned.length < images.length ? images[scanned.length] : null,
            estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
                ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, scanned.length, images.length)
                : null,
        }
        await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
    }

    const report: VulnerabilityReportFile = {
        generatedAt: new Date().toISOString(),
        imageCount: images.length,
        images: scanned,
    }

    await saveWithRetry(() => saveVulnerabilityReport(report), 'vulnerability report')

    return report
}

async function saveScanStatusBestEffort(status: DockerScoutScanStatus) {
    try {
        await saveWithRetry(() => saveVulnerabilityScanStatus(status), 'vulnerability scan status')
    } catch (error) {
        console.error('Failed to save vulnerability scan status:', error)
    }
}

async function saveWithRetry<T>(action: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= STORAGE_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await action()
        } catch (error) {
            lastError = error
            if (attempt === STORAGE_RETRY_ATTEMPTS) break
            await wait(attempt * 1000)
        }
    }

    console.error(`Failed to save ${label}:`, lastError)
    throw lastError
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
