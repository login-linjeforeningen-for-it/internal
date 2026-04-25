export default function toNumber(value: string | undefined) {
    const parsed = Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
}
