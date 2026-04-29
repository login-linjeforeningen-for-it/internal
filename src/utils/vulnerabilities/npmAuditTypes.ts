export type ScannerImageReport = Omit<ImageVulnerabilityReport, 'image' | 'scannedAt' | 'totalVulnerabilities' | 'scannerResults' | 'scanError'>
    & VulnerabilityScannerResult

export type PackageFolder = {
    directory: string
    name: string | null
    relativePath: string
}

export type NpmAuditMetadata = {
    vulnerabilities?: Partial<Record<'info' | 'low' | 'moderate' | 'high' | 'critical' | 'total', number>>
}

export type NpmAuditVia = {
    source?: string | number
    name?: string
    title?: string
    url?: string
    severity?: string
    range?: string
}

export type NpmAuditVulnerability = {
    name?: string
    severity?: string
    via?: Array<NpmAuditVia | string>
    range?: string
    fixAvailable?: boolean | { version?: string, name?: string }
}

export type NpmAuditReport = {
    auditReportVersion?: number
    metadata?: NpmAuditMetadata
    vulnerabilities?: Record<string, NpmAuditVulnerability>
}
