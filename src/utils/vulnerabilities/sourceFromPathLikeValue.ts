import path from 'path'
import normalizeSourceLabel from './normalizeSourceLabel.ts'

export default function sourceFromPathLikeValue(value: string): string {
    const normalized = value.trim().replace(/\\/g, '/')
    const basename = path.posix.basename(normalized)
    return normalizeSourceLabel(basename || normalized)
}
