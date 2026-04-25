export default function firstString(values: unknown[]): string | null {
    const candidate = values.find((value) => typeof value === 'string' && value.trim().length > 0)
    return typeof candidate === 'string' ? candidate : null
}
