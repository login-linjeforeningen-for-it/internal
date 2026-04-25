import { AVERAGE_QUERY_FIELDS } from './constants.ts'
import mapAverageQuerySeconds from './mapAverageQuerySeconds.ts'
import rowsToObjects from './rowsToObjects.ts'
import runPsql from './runPsql.ts'
import toNullableSeconds from './toNullableSeconds.ts'
import toNumber from './toNumber.ts'

type QueryableContainer = {
    id: string
}

export default async function getClusterActivity(container: QueryableContainer, credentials: DbCredentials) {
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
                COALESCE(REGEXP_REPLACE(query, E'\\r', '', 'g'), '')
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
