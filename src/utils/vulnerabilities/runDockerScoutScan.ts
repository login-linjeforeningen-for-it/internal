import path from 'path'
import getEstimatedCompletionAt from './getEstimatedCompletionAt.ts'
import getUniqueRunningImages from './getUniqueRunningImages.ts'
import mergeImageReports from './mergeImageReports.ts'
import scanImage from './scanImage.ts'
import { getNpmAuditProjects, scanNpmAuditProject } from './scanWithNpmAudit.ts'
import type { PackageFolder } from './npmAuditTypes.ts'
import { vulnerabilityScanRuntime } from './runtime.ts'
import { saveVulnerabilityImageResult, saveVulnerabilityReport, saveVulnerabilityScanStatus } from './storage.ts'

const STORAGE_RETRY_ATTEMPTS = 3

export default async function runDockerScoutScan(): Promise<VulnerabilityReportFile> {
    const images = await getUniqueRunningImages()
    const npmProjects = getNpmAuditProjects()
    const totalTargets = images.length + npmProjects.length
    const scanned: ImageVulnerabilityReport[] = []

    await startScanStatus(totalTargets, images[0] || null)
    await scanDockerImages(images, scanned, totalTargets)
    await scanNpmProjects(npmProjects, images, scanned, totalTargets)

    const report: VulnerabilityReportFile = {
        generatedAt: new Date().toISOString(),
        imageCount: scanned.length,
        images: scanned,
    }

    await saveWithRetry(() => saveVulnerabilityReport(report), 'vulnerability report')

    return report
}

async function startScanStatus(totalTargets: number, currentImage: string | null) {
    vulnerabilityScanRuntime.scanStatus = {
        ...vulnerabilityScanRuntime.scanStatus,
        totalImages: totalTargets,
        completedImages: 0,
        currentImage,
        estimatedCompletionAt: null,
    }
    await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
}

async function scanDockerImages(images: string[], scanned: ImageVulnerabilityReport[], totalTargets: number) {
    for (const image of images) {
        await updateScanStatus(image, scanned.length, totalTargets)
        const result = await scanImage(image)
        scanned.push(result)
        await saveWithRetry(() => saveVulnerabilityImageResult(result), `vulnerability image result for ${image}`)
        await updateScanStatus(scanned.length < images.length ? images[scanned.length] : 'npm audit', scanned.length, totalTargets)
    }
}

async function scanNpmProjects(projects: PackageFolder[], images: string[], scanned: ImageVulnerabilityReport[], totalTargets: number) {
    for (const [index, project] of projects.entries()) {
        const completedBeforeProject = images.length + index
        const currentImage = `npm:${project.relativePath || project.name || project.directory}`
        await updateScanStatus(currentImage, completedBeforeProject, totalTargets)
        const report = scanNpmAuditProject(project)
        const targetImage = getNpmTargetImage(project, images)
        const merged = mergeScannedReport(scanned, targetImage, report)
        await saveWithRetry(() => saveVulnerabilityImageResult(merged), `vulnerability npm audit result for ${targetImage}`)
        const nextProject = projects[index + 1]
        const nextImage = nextProject ? `npm:${nextProject.relativePath || nextProject.name || nextProject.directory}` : null
        await updateScanStatus(nextImage, completedBeforeProject + 1, totalTargets)
    }
}

function mergeScannedReport(scanned: ImageVulnerabilityReport[], targetImage: string, report: ImageVulnerabilityReport) {
    const existingIndex = scanned.findIndex((entry) => entry.image === targetImage)
    const targetReport = { ...report, image: targetImage }
    if (existingIndex < 0) {
        scanned.push(targetReport)
        return targetReport
    }

    const merged = mergeImageReports(targetImage, [scanned[existingIndex], targetReport])
    scanned[existingIndex] = merged
    return merged
}

function getNpmTargetImage(project: PackageFolder, images: string[]) {
    const relativePath = project.relativePath || project.name || path.basename(project.directory)
    const rootName = relativePath.split(/[\\/]/).filter(Boolean)[0] || relativePath
    const underscoredPath = relativePath.replace(/[\\/]/g, '_')
    const candidates = [rootName, underscoredPath, project.name, path.basename(project.directory)]
        .filter((candidate): candidate is string => Boolean(candidate))

    return candidates.find((candidate) => images.includes(candidate)) || rootName
}

async function updateScanStatus(currentImage: string | null, completedImages: number, totalTargets: number) {
    vulnerabilityScanRuntime.scanStatus = {
        ...vulnerabilityScanRuntime.scanStatus,
        completedImages,
        currentImage,
        estimatedCompletionAt: estimatedCompletion(completedImages, totalTargets),
    }
    await saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
}

function estimatedCompletion(completedImages: number, totalTargets: number) {
    if (!vulnerabilityScanRuntime.scanStatus.startedAt) {
        return null
    }

    return getEstimatedCompletionAt(vulnerabilityScanRuntime.scanStatus.startedAt, completedImages, totalTargets)
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
    const promise = new Promise((resolve) => {
        setTimeout(resolve, ms)
    })

    return promise
}
