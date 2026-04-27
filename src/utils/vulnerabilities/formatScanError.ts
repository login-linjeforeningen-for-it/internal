import firstLine from './firstLine.ts'

export default function formatScanError(error: any): string {
    const stderr = firstLine(error?.stderr)
    if (stderr) {
        return stderr
    }

    const stdout = firstLine(error?.stdout)
    if (stdout) {
        return stdout
    }

    const message = firstLine(error?.message)
    if (message.toLowerCase().startsWith('command failed:')) {
        return 'Container vulnerability scan command failed'
    }

    return message || 'Container vulnerability scan failed'
}
