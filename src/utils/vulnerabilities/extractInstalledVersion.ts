import firstString from './firstString.ts'

export default function extractInstalledVersion(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}

    return firstString([
        packageObject?.version,
        packageObject?.installedVersion,
        vulnerability?.installedVersion,
        vulnerability?.InstalledVersion,
        vulnerability?.version,
    ])
}
