import firstString from './firstString.ts'
import sourceFromPathLikeValue from './sourceFromPathLikeValue.ts'
import sourceFromPurl from './sourceFromPurl.ts'
import normalizeSourceLabel from './normalizeSourceLabel.ts'

export default function extractSource(vulnerability: any): string {
    const packageObject = vulnerability?.package || vulnerability?.artifact || vulnerability?.component || {}
    const locationObject = vulnerability?.location || {}
    const dependencyObject = locationObject?.dependency || {}
    const dependencyPackageObject = dependencyObject?.package || {}

    const purl = firstString([packageObject?.purl, vulnerability?.purl])
    const dependencyIdentifier = firstString([dependencyPackageObject?.name, dependencyObject?.name])

    if (dependencyIdentifier?.startsWith('pkg:')) {
        const dependencySource = sourceFromPurl(dependencyIdentifier)
        if (dependencySource !== 'unknown') {
            return dependencySource
        }
    }

    if (purl) {
        const purlSource = sourceFromPurl(purl)
        if (purlSource !== 'unknown') {
            return purlSource
        }
    }

    const pathLike = firstString([
        locationObject?.path,
        locationObject?.file,
        locationObject?.operating_system,
        packageObject?.location,
        packageObject?.path,
        packageObject?.source,
        dependencyPackageObject?.name,
        vulnerability?.source,
        vulnerability?.sourceName,
        vulnerability?.origin,
    ])

    if (pathLike) {
        return sourceFromPathLikeValue(pathLike)
    }

    const packageType = firstString([
        packageObject?.ecosystem,
        packageObject?.type,
        packageObject?.manager,
        vulnerability?.ecosystem,
        vulnerability?.packageType,
    ])

    if (packageType) {
        return `dependency:${normalizeSourceLabel(packageType)}`
    }

    return 'unknown'
}
