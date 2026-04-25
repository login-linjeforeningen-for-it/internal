export default function collectVulnerabilities(raw: any): any[] {
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.vulnerabilities)) return raw.vulnerabilities
    if (Array.isArray(raw?.matches)) {
        return raw.matches.map((match: any) => match?.vulnerability ?? match).filter(Boolean)
    }
    if (Array.isArray(raw?.results)) return raw.results.flatMap((result: any) => collectVulnerabilities(result))
    if (Array.isArray(raw?.artifacts)) return raw.artifacts.flatMap((artifact: any) => collectVulnerabilities(artifact))
    return []
}
