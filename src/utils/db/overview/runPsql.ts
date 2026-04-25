import { exec } from 'child_process'
import { promisify } from 'util'
import { FIELD_SEPARATOR, RECORD_SEPARATOR } from './constants.ts'
import shellEscape from './shellEscape.ts'

const execAsync = promisify(exec)

type QueryableContainer = {
    id: string
}

export default async function runPsql({
    container,
    credentials,
    database,
    sql,
}: {
    container: QueryableContainer
    credentials: DbCredentials
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
        .map((line) => line.replace(/\s+$/g, ''))
        .filter(Boolean)
}
