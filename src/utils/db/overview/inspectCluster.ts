import getClusterActivity from './getClusterActivity.ts'
import getClusterDatabases from './getClusterDatabases.ts'
import getContainerCredentials from './getContainerCredentials.ts'
import getDatabaseTables from './getDatabaseTables.ts'
import createBaseCluster from './createBaseCluster.ts'
import toNumber from './toNumber.ts'

type QueryableContainer = {
    id: string
    name: string
    project: string
    status: string
    workingDir?: string
}

export default async function inspectCluster(container: QueryableContainer): Promise<ClusterOverview> {
    const baseCluster = createBaseCluster(container)

    if (!container.status.startsWith('Up')) {
        return {
            ...baseCluster,
            error: 'Container is not running',
        }
    }

    try {
        const credentials = await getContainerCredentials(container)
        const [databaseRows, activity] = await Promise.all([
            getClusterDatabases(container, credentials),
            getClusterActivity(container, credentials),
        ])

        const databases = await Promise.all(databaseRows.map(async (databaseRow) => {
            const databaseName = databaseRow.name
            const runtime = activity.databaseRuntimeByName[databaseName] || {
                activeQueries: 0,
                currentConnections: 0,
                longestQuerySeconds: null,
                averageQuerySeconds: {
                    lastMinute: null,
                    lastFiveMinutes: null,
                    lastHour: null,
                    lastDay: null,
                },
            }
            const tables = await getDatabaseTables(container, credentials, databaseName)
            const largestTable = tables[0]

            return {
                name: databaseName,
                sizeBytes: toNumber(databaseRow.sizeBytes),
                tableCount: tables.length,
                activeQueries: runtime.activeQueries,
                currentConnections: runtime.currentConnections,
                longestQuerySeconds: runtime.longestQuerySeconds,
                averageQuerySeconds: runtime.averageQuerySeconds,
                largestTable: largestTable ? `${largestTable.schema}.${largestTable.name}` : null,
                tables,
            } satisfies DatabaseOverview
        }))

        return {
            ...baseCluster,
            databaseCount: databases.length,
            totalSizeBytes: databases.reduce((sum, database) => sum + database.sizeBytes, 0),
            activeQueries: activity.summary.activeQueries,
            currentConnections: activity.summary.currentConnections,
            longestQuery: activity.longestQuery,
            averageQuerySeconds: activity.summary.averageQuerySeconds,
            databases,
        }
    } catch (error) {
        return {
            ...baseCluster,
            error: (error as Error).message,
        }
    }
}
