import rowsToObjects from './rowsToObjects.ts'
import runPsql from './runPsql.ts'
import toNumber from './toNumber.ts'

type QueryableContainer = {
    id: string
}

export default async function getDatabaseTables(
    container: QueryableContainer,
    credentials: DbCredentials,
    database: string,
) {
    const rows = rowsToObjects(await runPsql({
        container,
        credentials,
        database,
        sql: `
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
        `,
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
