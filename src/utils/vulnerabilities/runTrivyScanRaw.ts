import { exec } from 'child_process'
import { promisify } from 'util'
import shellEscape from './shellEscape.ts'

const execAsync = promisify(exec)

export default async function runTrivyScanRaw(image: string) {
    const command = [
        'docker run --rm',
        '-v /var/run/docker.sock:/var/run/docker.sock',
        '-v trivy-cache:/root/.cache/',
        'aquasec/trivy:0.63.0',
        'image --format json --quiet --scanners vuln',
        shellEscape(image),
    ].join(' ')

    const { stdout } = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 })
    return JSON.parse(String(stdout))
}
