import firstString from './firstString.ts'

export default function extractDescription(vulnerability: any): string | null {
    return firstString([
        vulnerability?.description,
        vulnerability?.Description,
        vulnerability?.summary,
        vulnerability?.message,
        vulnerability?.vulnerability?.description,
        vulnerability?.vulnerability?.summary,
    ])
}
