import normalizeLevel from '#handlers/docker/normalizeLevel.ts'

const KNOWN_LEVELS = new Set(['error', 'warn', 'info', 'debug', 'trace'])

export default function inferLevel(message: string, fallback = '') {
    if (/\b(warn|warning)\b/i.test(message)) {
        return 'warn'
    }

    if (/\b(info|notice)\b/i.test(message)) {
        return 'info'
    }

    const normalizedFallback = normalizeLevel(fallback)
    return normalizedFallback && KNOWN_LEVELS.has(normalizedFallback)
        ? normalizedFallback
        : null
}
