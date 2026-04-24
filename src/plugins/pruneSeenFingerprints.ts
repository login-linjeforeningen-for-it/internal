import config from '#config'

export const seenFingerprints = new Map<string, number>()

export default function pruneSeenFingerprints() {
    const cutoff = Date.now() - config.logs.fingerprint.ms
    for (const [fingerprint, seenAt] of seenFingerprints.entries()) {
        if (seenAt < cutoff) {
            seenFingerprints.delete(fingerprint)
        }
    }
}
