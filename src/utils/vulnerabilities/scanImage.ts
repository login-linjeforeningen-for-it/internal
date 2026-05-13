import mergeScannerReports from './mergeScannerReports.ts'
import scanWithScanner from './scanWithScanner.ts'

const SCANNER_TIMEOUT_MS = 960_000

type ScannerImageReport = Omit<ImageVulnerabilityReport, 'image' | 'scannedAt' | 'totalVulnerabilities' | 'scannerResults' | 'scanError'>
    & VulnerabilityScannerResult

export default async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const report = await withScannerTimeout(scanWithScanner('docker_scout', image), image)
    return mergeScannerReports(image, report ? [report] : [])
}

function withScannerTimeout(
    scan: Promise<ScannerImageReport | null>,
    image: string
) {
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
            console.error(`Timed out docker scout scan for ${image}`)
            resolve(null)
        }, SCANNER_TIMEOUT_MS)
    })

    return Promise.race([scan, timeout]).finally(() => {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    })
}
