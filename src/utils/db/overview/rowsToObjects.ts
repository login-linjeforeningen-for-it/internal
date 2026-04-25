import { FIELD_SEPARATOR } from './constants.ts'

export default function rowsToObjects(lines: string[], keys: string[]) {
    return lines.map((line) => {
        const values = line.split(FIELD_SEPARATOR)
        return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? '']))
    })
}
