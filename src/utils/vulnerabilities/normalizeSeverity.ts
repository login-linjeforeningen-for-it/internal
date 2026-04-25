export default function normalizeSeverity(value: unknown): SeverityLevel {
    if (typeof value !== 'string') {
        return 'unknown'
    }

    const normalized = value.toLowerCase()

    if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
        return normalized
    }

    return 'unknown'
}
