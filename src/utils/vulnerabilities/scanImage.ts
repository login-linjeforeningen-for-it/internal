import mergeScannerReports from './mergeScannerReports.ts'
import scanWithScanner from './scanWithScanner.ts'

const SCANNER_TIMEOUT_MS: Record<VulnerabilityScanner, number> = {
    docker_scout: 960_000,
    trivy: 240_000,
    npm_audit: 120_000,
}

type ScannerImageReport = Omit<ImageVulnerabilityReport, 'image' | 'scannedAt' | 'totalVulnerabilities' | 'scannerResults' | 'scanError'>
    & VulnerabilityScannerResult

export default async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const reports = await Promise.all([
        withScannerTimeout(scanWithScanner('docker_scout', image), image, 'docker_scout'),
        withScannerTimeout(scanWithScanner('trivy', image), image, 'trivy'),
    ])

    return mergeScannerReports(image, reports.filter(isScannerReport))
}

function isScannerReport(report: ScannerImageReport | null): report is ScannerImageReport {
    if (!report) {
        return false
    }

    return true
}

function withScannerTimeout(
    scan: Promise<ScannerImageReport | null>,
    image: string,
    scanner: VulnerabilityScanner
) {
    return Promise.race([
        scan,
        new Promise<null>((resolve) => {
            setTimeout(() => {
                console.error(`Timed out ${scanner} scan for ${image}`)
                resolve(null)
            }, SCANNER_TIMEOUT_MS[scanner])
        }),
    ])
}
