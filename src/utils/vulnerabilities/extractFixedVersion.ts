import firstString from './firstString.ts'

export default function extractFixedVersion(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}
    const fixObject = vulnerability?.fix || vulnerability?.fixedIn || {}

    return firstString([
        vulnerability?.fixedVersion,
        vulnerability?.FixedVersion,
        fixObject?.version,
        fixObject?.versions?.[0],
        packageObject?.fixedVersion,
        Array.isArray(vulnerability?.fixedVersion) ? vulnerability.fixedVersion[0] : null,
    ])
}
