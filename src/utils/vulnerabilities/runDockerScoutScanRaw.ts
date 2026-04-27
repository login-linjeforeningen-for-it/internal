import { exec } from 'child_process'
import { promisify } from 'util'
import shellEscape from './shellEscape.ts'

const execAsync = promisify(exec)

export default async function runDockerScoutScanRaw(image: string) {
    const command = `docker scout cves local://${shellEscape(image)} --format sarif`

    try {
        const { stdout } = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 })
        return JSON.parse(String(stdout))
    } catch (error: any) {
        const stdout = typeof error?.stdout === 'string'
            ? error.stdout
            : Buffer.isBuffer(error?.stdout)
                ? error.stdout.toString('utf8')
                : ''

        if (stdout.trim()) {
            try {
                return JSON.parse(stdout)
            } catch {
                // Fall back to the original error when stdout is not valid JSON.
            }
        }

        throw error
    }
}
