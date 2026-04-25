export default function getEstimatedCompletionAt(startedAt: string, completedImages: number, totalImages: number): string | null {
    if (completedImages <= 0 || totalImages <= 0 || completedImages >= totalImages) {
        return null
    }

    const startedAtMs = new Date(startedAt).getTime()
    const nowMs = Date.now()
    const elapsedMs = nowMs - startedAtMs
    if (elapsedMs <= 0) {
        return null
    }

    const averagePerImageMs = elapsedMs / completedImages
    const remainingImages = totalImages - completedImages

    return new Date(nowMs + averagePerImageMs * remainingImages).toISOString()
}
