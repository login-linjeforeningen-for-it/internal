export default function isDockerScoutLimitedError(error: unknown) {
    const text = String(
        (error as any)?.stderr
        || (error as any)?.stdout
        || (error as any)?.message
        || error
        || ''
    ).toLowerCase()

    return text.includes('log in with your docker id')
        || text.includes('rate limit')
        || text.includes('too many requests')
        || text.includes('unauthorized')
        || text.includes('authentication required')
}
