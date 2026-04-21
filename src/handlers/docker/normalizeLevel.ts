import normalizeText from '#utils/normalize.ts'

export default function normalizeLevel(value: unknown) {
    const level = normalizeText(value).toLowerCase()
    if (!level) {
        return null
    }

    if (['error', 'fatal', 'panic', 'critical'].includes(level)) {
        return 'error'
    }

    if (['warn', 'warning'].includes(level)) {
        return 'warn'
    }

    if (['info', 'debug', 'trace'].includes(level)) {
        return level
    }

    return level
}
