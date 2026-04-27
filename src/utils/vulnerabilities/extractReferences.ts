export default function extractReferences(vulnerability: any): string[] {
    const references = [
        ...(Array.isArray(vulnerability?.links) ? vulnerability.links : []),
        ...(Array.isArray(vulnerability?.references) ? vulnerability.references : []),
        ...(Array.isArray(vulnerability?.urls) ? vulnerability.urls : []),
        vulnerability?.PrimaryURL,
        ...(Array.isArray(vulnerability?.References) ? vulnerability.References : []),
        ...(Array.isArray(vulnerability?.URLs) ? vulnerability.URLs : []),
    ]

    return Array.from(new Set(
        references.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    )).slice(0, 5)
}
