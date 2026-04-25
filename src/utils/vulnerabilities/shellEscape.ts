export default function shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
}
