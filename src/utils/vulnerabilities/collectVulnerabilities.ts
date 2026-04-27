export default function collectVulnerabilities(raw: any): any[] {
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.vulnerabilities)) return raw.vulnerabilities
    if (Array.isArray(raw?.Vulnerabilities)) {
        return raw.Vulnerabilities.map((vulnerability: any) => ({
            ...vulnerability,
            source: vulnerability?.source ?? raw?.Target ?? raw?.Type ?? raw?.Class,
            packageType: vulnerability?.PkgType ?? vulnerability?.Type ?? raw?.Type,
        }))
    }
    if (Array.isArray(raw?.matches)) {
        return raw.matches.map((match: any) => match?.vulnerability ?? match).filter(Boolean)
    }
    if (Array.isArray(raw?.runs)) {
        return raw.runs.flatMap((run: any) => collectScoutRunVulnerabilities(run))
    }
    if (Array.isArray(raw?.Results)) return raw.Results.flatMap((result: any) => collectVulnerabilities(result))
    if (Array.isArray(raw?.results)) return raw.results.flatMap((result: any) => collectVulnerabilities(result))
    if (Array.isArray(raw?.artifacts)) return raw.artifacts.flatMap((artifact: any) => collectVulnerabilities(artifact))
    return []
}

function collectScoutRunVulnerabilities(run: any) {
    const rules = new Map(
        (Array.isArray(run?.tool?.driver?.rules) ? run.tool.driver.rules : []).map((rule: any) => [rule?.id, rule])
    )

    return (Array.isArray(run?.results) ? run.results : [])
        .map((result: any) => mapScoutResult(result, rules.get(result?.ruleId)))
        .filter(Boolean)
}

function mapScoutResult(result: any, rule: any) {
    const properties = rule?.properties || {}
    const purl = Array.isArray(properties?.purls) ? properties.purls[0] : null
    const packageInfo = parsePurl(purl)

    return {
        id: result?.ruleId || rule?.id || 'unknown',
        title: rule?.shortDescription?.text || rule?.name || result?.ruleId || rule?.id || 'Untitled vulnerability',
        severity: properties?.cvssV3_severity || firstTag(properties?.tags),
        fixedVersion: properties?.fixed_version || null,
        description: result?.message?.text || rule?.help?.markdown || rule?.help?.text || null,
        references: [rule?.helpUri].filter(Boolean),
        package: {
            name: packageInfo?.name || null,
            ecosystem: packageInfo?.type || null,
            purl,
        },
        installedVersion: packageInfo?.version || null,
        location: {
            path: firstLocation(result?.locations),
        },
    }
}

function parsePurl(purl: string | null) {
    if (!purl || !purl.startsWith('pkg:')) {
        return null
    }

    const value = purl.slice(4).split('?')[0]
    const segments = value.split('/')
    const type = segments.shift()
    const rest = segments.join('/')
    if (!type || !rest) {
        return null
    }

    const atIndex = rest.lastIndexOf('@')
    const namePath = atIndex >= 0 ? rest.slice(0, atIndex) : rest
    const version = atIndex >= 0 ? rest.slice(atIndex + 1) : null
    const nameSegments = namePath.split('/')
    const name = nameSegments[nameSegments.length - 1] || null

    return {
        type,
        name,
        version,
    }
}

function firstTag(tags: unknown) {
    if (!Array.isArray(tags)) {
        return null
    }

    return tags.find((tag): tag is string => typeof tag === 'string') || null
}

function firstLocation(locations: unknown) {
    if (!Array.isArray(locations)) {
        return null
    }

    for (const location of locations) {
        const uri = location?.physicalLocation?.artifactLocation?.uri
        if (typeof uri === 'string' && uri.length > 0) {
            return uri
        }
    }

    return null
}
