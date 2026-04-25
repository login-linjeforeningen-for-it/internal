import extractVulnerabilityId from './extractVulnerabilityId.ts'
import firstString from './firstString.ts'

export default function extractTitle(vulnerability: any): string {
    return firstString([
        vulnerability?.title,
        vulnerability?.name,
        vulnerability?.message,
        vulnerability?.description,
        vulnerability?.summary,
        vulnerability?.vulnerability?.summary,
        vulnerability?.vulnerability?.description,
        extractVulnerabilityId(vulnerability),
    ]) || 'Untitled vulnerability'
}
