export default function parseJsonDocument(raw: string) {
    const trimmed = raw.trim()

    try {
        return JSON.parse(trimmed)
    } catch {
        const objectStart = trimmed.indexOf('{')
        const arrayStart = trimmed.indexOf('[')
        const jsonStart = [objectStart, arrayStart]
            .filter((index) => index >= 0)
            .sort((a, b) => a - b)[0]

        if (jsonStart == null) {
            throw new Error('No JSON document found in scanner output')
        }

        return JSON.parse(trimmed.slice(jsonStart))
    }
}
