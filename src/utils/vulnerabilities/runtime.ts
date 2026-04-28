export const vulnerabilityScanRuntime: {
    activeScan: Promise<VulnerabilityReportFile | null> | null
    scanStatus: DockerScoutScanStatus
} = {
    activeScan: null,
    scanStatus: {
        isRunning: false,
        startedAt: null,
        finishedAt: null,
        lastSuccessAt: null,
        lastError: null,
        totalImages: null,
        completedImages: 0,
        currentImage: null,
        estimatedCompletionAt: null,
    },
}
