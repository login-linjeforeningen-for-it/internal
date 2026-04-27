import config from '#config'
import { envParse } from 'utilbee/utils'
import fs from 'fs/promises'
import path from 'path'

export async function getContainerEnv(workingDir: string) {
    try {
        const envContent = await fs.readFile(path.join(workingDir, '.env'), 'utf-8')
        return Object.fromEntries(
            Object.entries(envParse(envContent)).map(([key, value]) => [key, normalizeEnvValue(value)])
        )
    } catch {
        return {}
    }
}

export function getBackupDir(project: string) {
    return path.join(config.backup.path, project)
}

export function normalizeEnvValue(value: string | null | undefined) {
    const trimmed = value?.trim() || ''

    if (['undefined', 'null', 'none'].includes(trimmed.toLowerCase())) {
        return ''
    }

    return trimmed
}
