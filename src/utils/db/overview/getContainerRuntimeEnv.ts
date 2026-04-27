import { exec } from 'child_process'
import { promisify } from 'util'
import { normalizeEnvValue } from '#utils/backup/utils.ts'
import shellEscape from './shellEscape.ts'

const execAsync = promisify(exec)

export default async function getContainerRuntimeEnv(containerId: string) {
    const command = `docker inspect ${shellEscape(containerId)} --format '{{range .Config.Env}}{{println .}}{{end}}'`
    const { stdout } = await execAsync(command)

    return Object.fromEntries(
        stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const separatorIndex = line.indexOf('=')
                if (separatorIndex === -1) {
                    return [line, '']
                }

                return [line.slice(0, separatorIndex), normalizeEnvValue(line.slice(separatorIndex + 1))]
            })
    )
}
