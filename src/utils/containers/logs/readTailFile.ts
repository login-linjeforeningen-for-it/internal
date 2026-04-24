import { readFileSync, existsSync } from 'fs'

export default function readTailFile(path: string, tail: number) {
    try {
        if (!existsSync(path)) {
            return ''
        }

        const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
        return lines.slice(-tail).join('\n')
    } catch {
        return ''
    }
}
