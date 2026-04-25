export default function aggregateAverageQuerySeconds(
    clusters: ClusterOverview[],
    key: keyof AverageQuerySeconds,
) {
    const values = clusters
        .map((cluster) => cluster.averageQuerySeconds[key])
        .filter((value): value is number => value !== null)

    if (!values.length) {
        return null
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length
}
