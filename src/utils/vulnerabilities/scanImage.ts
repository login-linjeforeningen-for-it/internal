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
    const reports: Array<ScannerImageReport | null> = []
    const scanners: VulnerabilityScanner[] = ['docker_scout', 'trivy']

    for (const scanner of scanners) {
        const report = await withScannerTimeout(scanWithScanner(scanner, image), image, scanner)
        reports.push(report)
    }

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
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
            console.error(`Timed out ${scanner} scan for ${image}`)
            resolve(null)
        }, SCANNER_TIMEOUT_MS[scanner])
    })

    return Promise.race([scan, timeout]).finally(() => {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    })
}
