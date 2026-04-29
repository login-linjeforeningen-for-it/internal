import runProcessText from './runProcessText.ts'

const TRIVY_TIMEOUT_SECONDS = 180

export default async function runTrivyScanRaw(image: string) {
    const { stdout } = await runProcessText([
        'docker',
        'run',
        '--rm',
        '-v',
        '/var/run/docker.sock:/var/run/docker.sock',
        '-v',
        'trivy-cache:/root/.cache/',
        'aquasec/trivy:0.63.0',
        'image',
        '--format',
        'json',
        '--quiet',
        '--scanners',
        'vuln',
        image,
    ], {
        maxBuffer: 20 * 1024 * 1024,
        timeoutMs: TRIVY_TIMEOUT_SECONDS * 1000,
    })
    return JSON.parse(String(stdout))
}
