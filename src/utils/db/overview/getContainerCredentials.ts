import { getContainerEnv } from '#utils/backup/utils.ts'
import getContainerRuntimeEnv from './getContainerRuntimeEnv.ts'

type QueryableContainer = {
    id: string
    workingDir?: string
}

export default async function getContainerCredentials(container: QueryableContainer): Promise<DbCredentials> {
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
