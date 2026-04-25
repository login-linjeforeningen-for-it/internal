export default function toNullableSeconds(value: string | undefined) {
    if (!value || value === '0') {
        return null
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}
