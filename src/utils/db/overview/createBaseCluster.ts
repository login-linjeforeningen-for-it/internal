export default function createBaseCluster(container: {
    id: string
    name: string
    project: string
    status: string
}): ClusterOverview {
    return {
        id: container.id,
        name: container.name,
        project: container.project,
        status: container.status,
        databaseCount: 0,
        totalSizeBytes: 0,
        activeQueries: 0,
        currentConnections: 0,
        longestQuery: null,
        averageQuerySeconds: {
            lastMinute: null,
            lastFiveMinutes: null,
            lastHour: null,
            lastDay: null,
        },
        databases: [],
        error: null,
    }
}
