import getEstimatedCompletionAt from './getEstimatedCompletionAt.ts'
import getUniqueRunningImages from './getUniqueRunningImages.ts'
import scanImage from './scanImage.ts'
import { vulnerabilityScanRuntime } from './runtime.ts'
import { saveVulnerabilityImageResult, saveVulnerabilityReport, saveVulnerabilityScanStatus } from './storage.ts'

const STORAGE_RETRY_ATTEMPTS = 3

export default async function runDockerScoutScan(): Promise<VulnerabilityReportFile> {
    const images = await getUniqueRunningImages()
    const scanned: ImageVulnerabilityReport[] = []

    await startScanStatus(images.length, images[0] || null)

    for (const image of images) {
        await updateScanStatus(image, scanned.length, images.length)
        const result = await scanImage(image)
        scanned.push(result)
        await saveWithRetry(() => saveVulnerabilityImageResult(result), `vulnerability image result for ${image}`)
    }

    await updateScanStatus(null, scanned.length, images.length)

    const report: VulnerabilityReportFile = {
        generatedAt: new Date().toISOString(),
        imageCount: scanned.length,
        images: scanned,
    }

    await saveWithRetry(() => saveVulnerabilityReport(report), 'vulnerability report')

    return report
}

async function startScanStatus(totalImages: number, currentImage: string | null) {
    vulnerabilityScanRuntime.scanStatus = {
        ...vulnerabilityScanRuntime.scanStatus,
        totalImages,
        completedImages: 0,
        currentImage,
        estimatedCompletionAt: null,
    }
    await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
}

async function updateScanStatus(currentImage: string | null, completedImages: number, totalImages: number) {
    vulnerabilityScanRuntime.scanStatus = {
        ...vulnerabilityScanRuntime.scanStatus,
        completedImages,
        currentImage,
        estimatedCompletionAt: vulnerabilityScanRuntime.scanStatus.startedAt
            ? getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, completedImages, totalImages)
            : null,
    }
    await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
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
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
