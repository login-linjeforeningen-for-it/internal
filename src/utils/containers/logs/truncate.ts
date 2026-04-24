export default function truncate(value: string, max = 1800) {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
