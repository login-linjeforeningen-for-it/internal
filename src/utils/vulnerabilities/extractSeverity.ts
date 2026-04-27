import normalizeSeverity from './normalizeSeverity.ts'

export default function extractSeverity(vulnerability: any): SeverityLevel {
    const candidates = [
        vulnerability?.severity,
        vulnerability?.Severity,
        vulnerability?.vulnerability?.severity,
        vulnerability?.cvss?.severity,
        vulnerability?.cvssV3?.severity,
    ]

    const firstKnown = candidates
        .map(normalizeSeverity)
        .find((severity) => severity !== 'unknown')

    return firstKnown ?? normalizeSeverity(candidates[0])
}
