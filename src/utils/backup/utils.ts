import config from '#config'
import { envParse } from 'utilbee/utils'
import fs from 'fs/promises'
import path from 'path'

export async function getContainerEnv(workingDir: string) {
    try {
        const envContent = await fs.readFile(path.join(workingDir, '.env'), 'utf-8')
        return envParse(envContent)
    } catch {
        return {}
    }
}

export function getBackupDir(project: string) {
    return path.join(config.backup.path, project)
}