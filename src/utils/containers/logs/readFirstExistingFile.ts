import readTailFile from './readTailFile'

export default function readFirstExistingFile(paths: string[], tail: number) {
    for (const path of paths) {
        const content = readTailFile(path, tail)
        if (content) {
            return content
        }
    }

    return ''
}
