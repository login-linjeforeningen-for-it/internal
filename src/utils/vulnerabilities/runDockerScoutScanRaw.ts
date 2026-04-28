import { exec } from 'child_process'
import { promisify } from 'util'
import parseJsonDocument from './parseJsonDocument.ts'
import shellEscape from './shellEscape.ts'

const execAsync = promisify(exec)
const DOCKER_SCOUT_TIMEOUT_SECONDS = 45

export default async function runDockerScoutScanRaw(image: string) {
    const command = `timeout -s KILL ${DOCKER_SCOUT_TIMEOUT_SECONDS}s docker scout cves local://${shellEscape(image)} --format sarif`

    try {
        const { stdout } = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 })
        return parseJsonDocument(String(stdout))
    } catch (error: any) {
        const stdout = typeof error?.stdout === 'string'
            ? error.stdout
            : Buffer.isBuffer(error?.stdout)
                ? error.stdout.toString('utf8')
                : ''

        if (stdout.trim()) {
            try {
                return parseJsonDocument(stdout)
            } catch {
                // Fall back to the original error when stdout is not valid JSON.
            }
        }

        throw error
    }
}
