import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default async function getUniqueRunningImages(): Promise<string[]> {
    const { stdout } = await execAsync('docker ps --format "{{.Image}}"')
    const images = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

    return Array.from(new Set(images)).sort((a, b) => a.localeCompare(b))
}
