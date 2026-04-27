import emptySeverityCount from './emptySeverityCount.ts'

export default function parseDockerScoutQuickview(output: string) {
    const severity = emptySeverityCount()
    const line = output
        .split('\n')
        .map((value) => value.trim())
        .find((value) => /\b\d+C\b/.test(value) && /\b\d+H\b/.test(value) && /\b\d+M\b/.test(value) && /\b\d+L\b/.test(value))

    if (!line) {
        throw new Error('Docker Scout quickview did not return a severity summary')
    }

    const counts = {
        critical: extractCount(line, /(\d+)C\b/),
        high: extractCount(line, /(\d+)H\b/),
        medium: extractCount(line, /(\d+)M\b/),
        low: extractCount(line, /(\d+)L\b/),
    }

    severity.critical = counts.critical
    severity.high = counts.high
    severity.medium = counts.medium
    severity.low = counts.low

    return {
        severity,
        totalVulnerabilities: counts.critical + counts.high + counts.medium + counts.low,
        summaryLine: line,
    }
}

function extractCount(line: string, pattern: RegExp) {
    const match = line.match(pattern)
    return match ? Number(match[1]) || 0 : 0
}
