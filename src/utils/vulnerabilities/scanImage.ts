import mergeScannerReports from './mergeScannerReports.ts'
import scanWithScanner from './scanWithScanner.ts'

export default async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const reports = await Promise.all([
        scanWithScanner('docker_scout', image),
        scanWithScanner('trivy', image),
    ])

    return mergeScannerReports(image, reports)
}
