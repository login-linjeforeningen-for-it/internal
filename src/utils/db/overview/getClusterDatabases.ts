import rowsToObjects from './rowsToObjects.ts'
import runPsql from './runPsql.ts'

type QueryableContainer = {
    id: string
}

export default async function getClusterDatabases(container: QueryableContainer, credentials: DbCredentials) {
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
