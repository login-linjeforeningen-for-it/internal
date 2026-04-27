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
    if (Array.isArray(raw?.Results)) return raw.Results.flatMap((result: any) => collectVulnerabilities(result))
    if (Array.isArray(raw?.results)) return raw.results.flatMap((result: any) => collectVulnerabilities(result))
    if (Array.isArray(raw?.artifacts)) return raw.artifacts.flatMap((artifact: any) => collectVulnerabilities(artifact))
    return []
}
