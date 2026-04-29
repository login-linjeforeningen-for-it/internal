import parseJsonDocument from './parseJsonDocument.ts'
import runProcessText from './runProcessText.ts'

const DOCKER_SCOUT_TIMEOUT_SECONDS = 900
const DOCKER_SCOUT_MAX_BUFFER = 128 * 1024 * 1024

export default async function runDockerScoutScanRaw(image: string) {
    try {
        const { stdout } = await runProcessText([
            'docker',
            'scout',
            'cves',
            `local://${image}`,
            '--format',
            'sarif',
        ], {
            maxBuffer: DOCKER_SCOUT_MAX_BUFFER,
            timeoutMs: DOCKER_SCOUT_TIMEOUT_SECONDS * 1000,
        })
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
