import emptySeverityCount from './emptySeverityCount.ts'

export default function buildGroupBreakdown(vulnerabilities: VulnerabilityDetail[]) {
    const grouped = new Map<string, VulnerabilityGroup>()

    for (const vulnerability of vulnerabilities) {
        if (!grouped.has(vulnerability.source)) {
            grouped.set(vulnerability.source, {
                source: vulnerability.source,
                total: 0,
                severity: emptySeverityCount(),
            })
        }

        const group = grouped.get(vulnerability.source)
        if (!group) {
            continue
        }

        group.total += 1
        group.severity[vulnerability.severity] += 1
    }

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total)
}
