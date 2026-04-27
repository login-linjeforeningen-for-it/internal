const severityRank: Record<SeverityLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    unknown: 4,
}

export default function getSeverityRank(severity: SeverityLevel) {
    return severityRank[severity]
}
