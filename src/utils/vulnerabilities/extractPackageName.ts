import firstString from './firstString.ts'

export default function extractPackageName(vulnerability: any): string | null {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}
    const locationObject = vulnerability?.location || {}
    const dependencyObject = locationObject?.dependency || {}
    const dependencyPackageObject = dependencyObject?.package || {}

    return firstString([
        packageObject?.name,
        packageObject?.package_name,
        dependencyPackageObject?.name,
        dependencyObject?.name,
        vulnerability?.packageName,
        vulnerability?.PkgName,
        vulnerability?.PkgID,
        vulnerability?.package,
    ])
}
