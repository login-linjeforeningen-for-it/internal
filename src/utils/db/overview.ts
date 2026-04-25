import getPostgresContainers from '#utils/backup/containers.ts'
import aggregateAverageQuerySeconds from './overview/aggregateAverageQuerySeconds.ts'
import inspectCluster from './overview/inspectCluster.ts'

type QueryableContainer = Awaited<ReturnType<typeof getPostgresContainers>>[number]

export default async function getDatabaseOverview(): Promise<DatabaseOverviewResponse> {
    const containers = await getPostgresContainers({ all: true })
    const clusters = await Promise.all(containers.map((container) => inspectCluster(container as QueryableContainer)))
    const allDatabases = clusters.flatMap((cluster) => cluster.databases)
    const longestQuery = clusters
        .map((cluster) => cluster.longestQuery)
        .filter((query): query is QueryOverview => Boolean(query))
        .sort((a, b) => b.ageSeconds - a.ageSeconds)[0] || null

    return {
        generatedAt: new Date().toISOString(),
        clusterCount: clusters.length,
        databaseCount: allDatabases.length,
        totalSizeBytes: allDatabases.reduce((sum, database) => sum + database.sizeBytes, 0),
        activeQueries: clusters.reduce((sum, cluster) => sum + cluster.activeQueries, 0),
        longestQuery,
        averageQuerySeconds: {
            lastMinute: aggregateAverageQuerySeconds(clusters, 'lastMinute'),
            lastFiveMinutes: aggregateAverageQuerySeconds(clusters, 'lastFiveMinutes'),
            lastHour: aggregateAverageQuerySeconds(clusters, 'lastHour'),
            lastDay: aggregateAverageQuerySeconds(clusters, 'lastDay'),
        },
        clusters,
    }
}
