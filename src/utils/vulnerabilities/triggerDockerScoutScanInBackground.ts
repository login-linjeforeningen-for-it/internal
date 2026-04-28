import formatScanError from './formatScanError.ts'
import getDockerScoutScanStatus from './getDockerScoutScanStatus.ts'
import runDockerScoutScan from './runDockerScoutScan.ts'
import { vulnerabilityScanRuntime } from './runtime.ts'
import { saveVulnerabilityScanStatus } from './storage.ts'

function saveScanStatusBestEffort(status: DockerScoutScanStatus) {
    void saveVulnerabilityScanStatus(status).catch((error) => {
        console.error('Failed to save vulnerability scan status:', error)
    })
}

export default function triggerDockerScoutScanInBackground(): {
    started: boolean
    status: DockerScoutScanStatus
} {
    if (vulnerabilityScanRuntime.activeScan) {
        return {
            started: false,
            status: getDockerScoutScanStatus(),
        }
    }

    const startedAt = new Date().toISOString()
    vulnerabilityScanRuntime.scanStatus = {
        ...vulnerabilityScanRuntime.scanStatus,
        isRunning: true,
        startedAt,
        finishedAt: null,
        lastError: null,
        totalImages: null,
        completedImages: 0,
        currentImage: null,
        estimatedCompletionAt: null,
    }
    saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)

    vulnerabilityScanRuntime.activeScan = runDockerScoutScan()
        .then((report) => {
            vulnerabilityScanRuntime.scanStatus = {
                ...vulnerabilityScanRuntime.scanStatus,
                lastSuccessAt: report.generatedAt,
                lastError: null,
                currentImage: null,
                estimatedCompletionAt: null,
            }
            saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
            return report
        })
        .catch((error: any) => {
            vulnerabilityScanRuntime.scanStatus = {
                ...vulnerabilityScanRuntime.scanStatus,
                lastError: formatScanError(error),
                currentImage: null,
                estimatedCompletionAt: null,
            }
            saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
            return null
        })
        .finally(() => {
            vulnerabilityScanRuntime.scanStatus = {
                ...vulnerabilityScanRuntime.scanStatus,
                isRunning: false,
                finishedAt: new Date().toISOString(),
                currentImage: null,
            }
            saveScanStatusBestEffort(vulnerabilityScanRuntime.scanStatus)
            vulnerabilityScanRuntime.activeScan = null
        })

    return {
        started: true,
        status: getDockerScoutScanStatus(),
    }
}
