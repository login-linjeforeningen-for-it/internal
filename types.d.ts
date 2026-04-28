type SQLParamType = (string | number | null | boolean | string[] | Date | Buffer)[]

type ParsedLogEntry = {
    raw: string
    message: string
    level: string
    timestamp: string | null
    isError: boolean
    structured: boolean
}

type LogEntry = ParsedLogEntry & {
    fingerprint: string
}

type LogSource = {
    id: string
    name: string
    service: string
    status: string
    raw: string
    sourceType: 'container' | 'journal' | 'file' | 'history' | 'deployment'
}

type CollectedLogSource = {
    id: string
    name: string
    service: string
    status: string
    sourceType: LogSource['sourceType']
    matchedLines: number
    entries: LogEntry[]
}

type CollectedLogsOverview = {
    server: string
    checkedAt: string
    filters: {
        service?: string
        container?: string
        search?: string
        level: 'all' | 'error'
        tail: number
    }
    totalContainers: number
    containers: CollectedLogSource[]
}

type AverageQuerySeconds = {
    lastMinute: number | null
    lastFiveMinutes: number | null
    lastHour: number | null
    lastDay: number | null
}

type DatabaseQueryRuntime = {
    activeQueries: number
    currentConnections: number
    longestQuerySeconds: number | null
    averageQuerySeconds: AverageQuerySeconds
}

type QueryOverview = {
    database: string
    user: string | null
    application: string | null
    ageSeconds: number
    waitEventType: string | null
    query: string
}

type TableOverview = {
    schema: string
    name: string
    estimatedRows: number
    tableBytes: number
    indexBytes: number
    totalBytes: number
}

type DatabaseOverview = {
    name: string
    sizeBytes: number
    tableCount: number
    activeQueries: number
    currentConnections: number
    longestQuerySeconds: number | null
    averageQuerySeconds: AverageQuerySeconds
    largestTable: string | null
    tables: TableOverview[]
}

type ClusterOverview = {
    id: string
    name: string
    project: string
    status: string
    databaseCount: number
    totalSizeBytes: number
    activeQueries: number
    currentConnections: number
    longestQuery: QueryOverview | null
    averageQuerySeconds: AverageQuerySeconds
    databases: DatabaseOverview[]
    error: string | null
}

type DatabaseOverviewResponse = {
    generatedAt: string
    clusterCount: number
    databaseCount: number
    totalSizeBytes: number
    activeQueries: number
    longestQuery: QueryOverview | null
    averageQuerySeconds: AverageQuerySeconds
    clusters: ClusterOverview[]
}

type QueryResultRow = Record<string, string>

type DbCredentials = {
    DB: string
    DB_USER: string
    DB_PASSWORD: string
}

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

type SeverityCount = Record<SeverityLevel, number>

type VulnerabilityScanner = 'docker_scout' | 'trivy' | 'npm_audit'

interface VulnerabilityGroup {
    source: string
    total: number
    severity: SeverityCount
}

interface VulnerabilityDetail {
    id: string
    title: string
    severity: SeverityLevel
    source: string
    packageName: string | null
    packageType: string | null
    installedVersion: string | null
    fixedVersion: string | null
    description: string | null
    references: string[]
    scanners: VulnerabilityScanner[]
}

interface VulnerabilityScannerResult {
    scanner: VulnerabilityScanner
    scannedAt: string
    totalVulnerabilities: number
    severity: SeverityCount
    scanError: string | null
    summaryOnly: boolean
    note: string | null
}

interface ImageVulnerabilityReport {
    image: string
    scannedAt: string
    totalVulnerabilities: number
    severity: SeverityCount
    groups: VulnerabilityGroup[]
    vulnerabilities: VulnerabilityDetail[]
    scannerResults: VulnerabilityScannerResult[]
    scanError: string | null
}

interface VulnerabilityReportFile {
    generatedAt: string | null
    imageCount: number
    images: ImageVulnerabilityReport[]
}

interface DockerScoutScanStatus {
    isRunning: boolean
    startedAt: string | null
    finishedAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    totalImages: number | null
    completedImages: number
    currentImage: string | null
    estimatedCompletionAt: string | null
}

type VulnerabilityCounts = {
    info: number
    low: number
    moderate: number
    high: number
    critical: number
}

type ProjectFinding = {
    repository: string
    folder: string
    summary: string
    vulnerabilities: VulnerabilityCounts
}

type VulnerabilityIdentifier = {
    name: string
    folder: string
    count: number
    time: number
}

type NotifiedVulnerabilities = {
    critical: VulnerabilityIdentifier[]
    high: VulnerabilityIdentifier[]
    medium: VulnerabilityIdentifier[]
}

type Expires = {
    vault: string
    title: string
    time: string
    seen: number
}

type ExpiresAlert = {
    hasExpired: Expires[]
    expiresNextWeek: Expires[]
    expiresNextMonth: Expires[]
}

type ProjectReport = {
    title: string
    description: string
    highestSeverity: 'critical' | 'high' | 'medium'
}

type SecretReport = {
    ping: boolean
    red: boolean
    finalReport: string
    secretsToReport: boolean
}

type JobState<T> = {
    enabled: boolean
    intervalMinutes: number
    lastStartedAt: string | null
    lastFinishedAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    result: T | null
}

type Scout = {
    updatedAt: string | null
    projectRoot: string
    projects: JobState<{
        repositories: string[]
        findings: ProjectFinding[]
        notified: NotifiedVulnerabilities
        report: ProjectReport | null
        alertSent: boolean
    }>
    onePassword: JobState<{
        categories: ExpiresAlert
        report: SecretReport | null
        alertSent: boolean
        vaultCount: number
        itemCount: number
    }>
}
