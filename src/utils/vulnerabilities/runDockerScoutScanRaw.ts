import parseJsonDocument from './parseJsonDocument.ts'
import runProcessText from './runProcessText.ts'

const DOCKER_SCOUT_TIMEOUT_SECONDS = 180

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
            maxBuffer: 20 * 1024 * 1024,
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
