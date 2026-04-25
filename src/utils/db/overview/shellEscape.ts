export default function shellEscape(value: string) {
    return `'${value.replace(/'/g, `'\"'\"'`)}'`
}
