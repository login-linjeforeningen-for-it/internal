import mergeScannerReports from './mergeScannerReports.ts'
import scanWithNpmAudit from './scanWithNpmAudit.ts'
import scanWithScanner from './scanWithScanner.ts'

export default async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const reports = await Promise.all([
        scanWithScanner('docker_scout', image),
        scanWithScanner('trivy', image),
        scanWithNpmAudit(image),
    ])

    return mergeScannerReports(image, reports)
}
