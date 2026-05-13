import { exec } from 'child_process'
import { promisify } from 'util'
import { scanImage } from './scanner.ts'
import { loadScanStatus, saveImageResult, saveReport, saveScanStatus } from './storage.ts'

const execAsync = promisify(exec)

const status: DockerScoutScanStatus = {
    isRunning: false, startedAt: null, finishedAt: null, lastSuccessAt: null,
    lastError: null, totalImages: null, completedImages: 0, currentImage: null, estimatedCompletionAt: null,
}

let activeScan: Promise<void> | null = null

export function getScanStatus(): DockerScoutScanStatus {
    return { ...status }
}

export async function getOrLoadScanStatus(): Promise<DockerScoutScanStatus> {
    if (status.isRunning) return getScanStatus()
    return loadScanStatus()
}

export function triggerScan(): { started: boolean; status: DockerScoutScanStatus } {
    if (activeScan) return { started: false, status: getScanStatus() }

    Object.assign(status, {
        isRunning: true,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        lastError: null,
        totalImages: null,
        completedImages: 0,
        currentImage: null,
        estimatedCompletionAt: null,
    })
    persist()

    activeScan = runScan()
        .then(() => { status.lastSuccessAt = status.finishedAt })
        .catch((err: any) => { status.lastError = String(err?.message || err) })
        .finally(() => {
            Object.assign(status, { isRunning: false, finishedAt: new Date().toISOString(), currentImage: null })
            persist()
            activeScan = null
        })

    return { started: true, status: getScanStatus() }
}

async function runScan() {
    const images = await getRunningImages()
    status.totalImages = images.length

    const scanned: ImageVulnerabilityReport[] = []
    for (const image of images) {
        status.currentImage = image
        status.completedImages = scanned.length
        status.estimatedCompletionAt = estimateCompletion(status.startedAt, scanned.length, images.length)
        persist()

        const result = await scanImage(image)
        scanned.push(result)
        await saveImageResult(result).catch(() => undefined)
    }

    status.completedImages = scanned.length
    status.currentImage = null
    status.estimatedCompletionAt = null

    await saveReport({
        generatedAt: new Date().toISOString(),
        imageCount: scanned.length,
        images: scanned,
    })
}

function persist() {
    void saveScanStatus({ ...status }).catch(() => undefined)
}

async function getRunningImages(): Promise<string[]> {
    const { stdout } = await execAsync('docker ps --format "{{.Image}}"')
    return [...new Set(stdout.split('\n').map(l => l.trim()).filter(Boolean))].sort()
}

function estimateCompletion(startedAt: string | null, completed: number, total: number): string | null {
    if (!startedAt || completed <= 0 || completed >= total) return null
    const elapsed = Date.now() - new Date(startedAt).getTime()
    if (elapsed <= 0) return null
    return new Date(Date.now() + (elapsed / completed) * (total - completed)).toISOString()
}
