import { getContainerEnv, normalizeEnvValue } from '#utils/backup/utils.ts'
import getContainerRuntimeEnv from './getContainerRuntimeEnv.ts'

type QueryableContainer = {
    id: string
    workingDir?: string
}

export default async function getContainerCredentials(container: QueryableContainer): Promise<DbCredentials> {
    const env = container.workingDir ? await getContainerEnv(container.workingDir) : {}
    const fallbackEnv = await getContainerRuntimeEnv(container.id)
    const DB = firstDefinedValue(
        env.DB,
        env.POSTGRES_DB,
        fallbackEnv.DB,
        fallbackEnv.POSTGRES_DB
    )
    const DB_USER = firstDefinedValue(
        env.DB_USER,
        env.POSTGRES_USER,
        fallbackEnv.DB_USER,
        fallbackEnv.POSTGRES_USER
    )
    const DB_PASSWORD = firstDefinedValue(
        env.DB_PASSWORD,
        env.POSTGRES_PASSWORD,
        fallbackEnv.DB_PASSWORD,
        fallbackEnv.POSTGRES_PASSWORD
    )

    if (!DB || !DB_USER) {
        throw new Error('Missing database name or user in .env or runtime environment')
    }

    return { DB, DB_USER, DB_PASSWORD }
}

function firstDefinedValue(...values: Array<string | undefined>) {
    for (const value of values) {
        const normalized = normalizeCredentialValue(value)
        if (normalized) {
            return normalized
        }
    }

    return ''
}

function normalizeCredentialValue(value: string | undefined) {
    return normalizeEnvValue(value)
}
