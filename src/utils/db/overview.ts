import { exec } from 'child_process'
import { promisify } from 'util'
import getPostgresContainers from '#utils/backup/containers.ts'
import { getContainerEnv } from '#utils/backup/utils.ts'

const execAsync = promisify(exec)
const FIELD_SEPARATOR = '\u001f'
const RECORD_SEPARATOR = '\u001e'

type QueryableContainer = Awaited<ReturnType<typeof getPostgresContainers>>[number]

type QueryResultRow = Record<string, string>

type DatabaseQueryRuntime = {
    activeQueries: number
    currentConnections: number
    longestQuerySeconds: number | null
    averageQuerySeconds: {
        lastMinute: number | null
        lastFiveMinutes: number | null
        lastHour: number | null
        lastDay: number | null
    }
}

type QueryOverview = {
    database: string
    user: string | null
    application: string | null
    ageSeconds: number
    waitEventType: string | null
    query: string
}

type TableOverview = {
    schema: string
    name: string
    estimatedRows: number
    tableBytes: number
    indexBytes: number
    totalBytes: number
}

type DatabaseOverview = {
    name: string
    sizeBytes: number
    tableCount: number
    activeQueries: number
    currentConnections: number
    longestQuerySeconds: number | null
    averageQuerySeconds: DatabaseQueryRuntime['averageQuerySeconds']
    largestTable: string | null
    tables: TableOverview[]
}

type ClusterOverview = {
    id: string
    name: string
    project: string
    status: string
    databaseCount: number
    totalSizeBytes: number
    activeQueries: number
    currentConnections: number
    longestQuery: QueryOverview | null
    averageQuerySeconds: DatabaseQueryRuntime['averageQuerySeconds']
    databases: DatabaseOverview[]
    error: string | null
}

export type DatabaseOverviewResponse = {
    generatedAt: string
    clusterCount: number
    databaseCount: number
    totalSizeBytes: number
    activeQueries: number
    longestQuery: QueryOverview | null
    averageQuerySeconds: DatabaseQueryRuntime['averageQuerySeconds']
    clusters: ClusterOverview[]
}

type Credentials = {
    DB: string
    DB_USER: string
    DB_PASSWORD: string
}

const AVERAGE_QUERY_FIELDS = {
    lastMinute: 'avg_last_minute_seconds',
    lastFiveMinutes: 'avg_last_five_minutes_seconds',
    lastHour: 'avg_last_hour_seconds',
    lastDay: 'avg_last_day_seconds',
} as const

function shellEscape(value: string) {
    return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function toNumber(value: string | undefined) {
    const parsed = Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
}

function toNullableSeconds(value: string | undefined) {
    if (!value || value === '0') {
        return null
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function mapAverageQuerySeconds(row?: QueryResultRow) {
    return {
        lastMinute: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastMinute]),
        lastFiveMinutes: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastFiveMinutes]),
        lastHour: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastHour]),
        lastDay: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastDay]),
    }
}

async function runPsql({
    container,
    credentials,
    database,
    sql,
}: {
    container: QueryableContainer
    credentials: Credentials
    database: string
    sql: string
}) {
    const command = [
        'docker exec',
        `-e PGPASSWORD=${shellEscape(credentials.DB_PASSWORD)}`,
        shellEscape(container.id),
        'psql',
        '-X',
        '-v ON_ERROR_STOP=1',
        `-U ${shellEscape(credentials.DB_USER)}`,
        `-d ${shellEscape(database)}`,
        '-At',
        `-F ${shellEscape(FIELD_SEPARATOR)}`,
        `-R ${shellEscape(RECORD_SEPARATOR)}`,
        `-c ${shellEscape(sql)}`,
    ].join(' ')

    const { stdout } = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 })
    return stdout
        .split(RECORD_SEPARATOR)
        .map(line => line.replace(/\s+$/g, ''))
        .filter(Boolean)
}

function rowsToObjects(lines: string[], keys: string[]) {
    return lines.map((line) => {
        const values = line.split(FIELD_SEPARATOR)
        return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? '']))
    })
}

async function getContainerCredentials(container: QueryableContainer): Promise<Credentials> {
    const env = container.workingDir ? await getContainerEnv(container.workingDir) : {}
    const fallbackEnv = await getContainerRuntimeEnv(container.id)
    const DB = env.DB || env.POSTGRES_DB
        || fallbackEnv.DB
        || fallbackEnv.POSTGRES_DB
    const DB_USER = env.DB_USER || env.POSTGRES_USER
        || fallbackEnv.DB_USER
        || fallbackEnv.POSTGRES_USER
    const DB_PASSWORD = env.DB_PASSWORD || env.POSTGRES_PASSWORD
        || fallbackEnv.DB_PASSWORD
        || fallbackEnv.POSTGRES_PASSWORD

    if (!DB || !DB_USER || !DB_PASSWORD) {
        throw new Error('Missing database credentials in .env')
    }

    return { DB, DB_USER, DB_PASSWORD }
}

async function getContainerRuntimeEnv(containerId: string) {
    const command = `docker inspect ${shellEscape(containerId)} --format '{{range .Config.Env}}{{println .}}{{end}}'`
    const { stdout } = await execAsync(command)

    return Object.fromEntries(
        stdout
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map((line) => {
                const separatorIndex = line.indexOf('=')
                if (separatorIndex === -1) {
                    return [line, '']
                }

                return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]
            })
    )
}

async function getClusterDatabases(container: QueryableContainer, credentials: Credentials) {
    const lines = await runPsql({
        container,
        credentials,
        database: credentials.DB,
        sql: `
            SELECT datname, pg_database_size(datname)
            FROM pg_database
            WHERE datistemplate = false
            ORDER BY pg_database_size(datname) DESC, datname ASC;
        `,
    })

    return rowsToObjects(lines, ['name', 'sizeBytes'])
}

async function getClusterActivity(container: QueryableContainer, credentials: Credentials) {
    const [summaryRow] = rowsToObjects(await runPsql({
        container,
        credentials,
        database: credentials.DB,
        sql: `
            WITH activity AS (
                SELECT
                    datname,
                    state,
                    query_start,
                    EXTRACT(EPOCH FROM NOW() - query_start) AS age_seconds
                FROM pg_stat_activity
                WHERE pid <> pg_backend_pid()
                  AND datname IS NOT NULL
                  AND query_start IS NOT NULL
            )
            SELECT
                COUNT(*) FILTER (WHERE state = 'active'),
                COUNT(*),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 60 THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 300 THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 3600 THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 86400 THEN age_seconds END), 0)
            FROM activity;
        `,
    }), [
        'active_queries',
        'current_connections',
        AVERAGE_QUERY_FIELDS.lastMinute,
        AVERAGE_QUERY_FIELDS.lastFiveMinutes,
        AVERAGE_QUERY_FIELDS.lastHour,
        AVERAGE_QUERY_FIELDS.lastDay,
    ])

    const [longestRow] = rowsToObjects(await runPsql({
        container,
        credentials,
        database: credentials.DB,
        sql: `
            SELECT
                datname,
                usename,
                NULLIF(application_name, ''),
                EXTRACT(EPOCH FROM NOW() - query_start),
                NULLIF(wait_event_type, ''),
                LEFT(REGEXP_REPLACE(query, E'\\s+', ' ', 'g'), 400)
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND state = 'active'
              AND datname IS NOT NULL
              AND query_start IS NOT NULL
            ORDER BY query_start ASC
            LIMIT 1;
        `,
    }), ['database', 'user', 'application', 'ageSeconds', 'waitEventType', 'query'])

    const databaseRows = rowsToObjects(await runPsql({
        container,
        credentials,
        database: credentials.DB,
        sql: `
            WITH activity AS (
                SELECT
                    datname,
                    state,
                    query_start,
                    EXTRACT(EPOCH FROM NOW() - query_start) AS age_seconds
                FROM pg_stat_activity
                WHERE pid <> pg_backend_pid()
                  AND datname IS NOT NULL
                  AND query_start IS NOT NULL
            )
            SELECT
                datname,
                COUNT(*) FILTER (WHERE state = 'active'),
                COUNT(*),
                COALESCE(MAX(CASE WHEN state = 'active' THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 60 THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 300 THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 3600 THEN age_seconds END), 0),
                COALESCE(AVG(CASE WHEN state = 'active' AND age_seconds <= 86400 THEN age_seconds END), 0)
            FROM activity
            GROUP BY datname;
        `,
    }), [
        'name',
        'active_queries',
        'current_connections',
        'longest_query_seconds',
        AVERAGE_QUERY_FIELDS.lastMinute,
        AVERAGE_QUERY_FIELDS.lastFiveMinutes,
        AVERAGE_QUERY_FIELDS.lastHour,
        AVERAGE_QUERY_FIELDS.lastDay,
    ])

    const databaseRuntimeByName = Object.fromEntries(
        databaseRows.map((row) => [
            row.name,
            {
                activeQueries: toNumber(row.active_queries),
                currentConnections: toNumber(row.current_connections),
                longestQuerySeconds: toNullableSeconds(row.longest_query_seconds),
                averageQuerySeconds: mapAverageQuerySeconds(row),
            } satisfies DatabaseQueryRuntime,
        ])
    )

    return {
        summary: {
            activeQueries: toNumber(summaryRow?.active_queries),
            currentConnections: toNumber(summaryRow?.current_connections),
            averageQuerySeconds: mapAverageQuerySeconds(summaryRow),
        },
        longestQuery: longestRow
            ? {
                database: longestRow.database,
                user: longestRow.user || null,
                application: longestRow.application || null,
                ageSeconds: toNumber(longestRow.ageSeconds),
                waitEventType: longestRow.waitEventType || null,
                query: longestRow.query || 'Unavailable',
            }
            : null,
        databaseRuntimeByName,
    }
}

async function getDatabaseTables(
    container: QueryableContainer,
    credentials: Credentials,
    database: string,
) {
    const sql = `
        SELECT
            schemaname,
            relname,
            COALESCE(n_live_tup, 0),
            pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)),
            pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname)),
            pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) DESC,
                 schemaname ASC,
                 relname ASC;
    `

    const rows = rowsToObjects(await runPsql({
        container,
        credentials,
        database,
        sql,
    }), ['schema', 'name', 'estimatedRows', 'tableBytes', 'indexBytes', 'totalBytes'])

    return rows.map((row) => ({
        schema: row.schema,
        name: row.name,
        estimatedRows: toNumber(row.estimatedRows),
        tableBytes: toNumber(row.tableBytes),
        indexBytes: toNumber(row.indexBytes),
        totalBytes: toNumber(row.totalBytes),
    }))
}

async function inspectContainer(container: QueryableContainer): Promise<ClusterOverview> {
    const baseCluster: ClusterOverview = {
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

export default async function getDatabaseOverview(): Promise<DatabaseOverviewResponse> {
    const containers = await getPostgresContainers({ all: true })
    const clusters = await Promise.all(containers.map(inspectContainer))
    const allDatabases = clusters.flatMap(cluster => cluster.databases)
    const longestQuery = clusters
        .map(cluster => cluster.longestQuery)
        .filter((query): query is QueryOverview => Boolean(query))
        .sort((a, b) => b.ageSeconds - a.ageSeconds)[0] || null

    const aggregateAverage = (key: keyof DatabaseOverviewResponse['averageQuerySeconds']) => {
        const values = clusters
            .map(cluster => cluster.averageQuerySeconds[key])
            .filter((value): value is number => value !== null)

        if (!values.length) {
            return null
        }

        return values.reduce((sum, value) => sum + value, 0) / values.length
    }

    return {
        generatedAt: new Date().toISOString(),
        clusterCount: clusters.length,
        databaseCount: allDatabases.length,
        totalSizeBytes: allDatabases.reduce((sum, database) => sum + database.sizeBytes, 0),
        activeQueries: clusters.reduce((sum, cluster) => sum + cluster.activeQueries, 0),
        longestQuery,
        averageQuerySeconds: {
            lastMinute: aggregateAverage('lastMinute'),
            lastFiveMinutes: aggregateAverage('lastFiveMinutes'),
            lastHour: aggregateAverage('lastHour'),
            lastDay: aggregateAverage('lastDay'),
        },
        clusters,
    }
}
