import firstString from './firstString.ts'

export default function extractPackageType(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}

    return firstString([
        packageObject?.ecosystem,
        packageObject?.type,
        packageObject?.manager,
        vulnerability?.ecosystem,
        vulnerability?.packageType,
    ])
}
