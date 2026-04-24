type SQLParamType = (string | number | null | boolean | string[] | Date | Buffer)[]

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
