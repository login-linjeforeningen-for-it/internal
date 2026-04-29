import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import type { PackageFolder } from './npmAuditTypes.ts'

const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'build', 'dist', 'node_modules'])
const MAX_SEARCH_DEPTH = 4
const DOCKER_PS_TIMEOUT_MS = 10_000

export function findPackageFolders(root: string) {
    const folders: PackageFolder[] = []
    walkPackageFolders(root, '', 0, folders)
    return folders
}

export function findPackageFolderForImage(root: string, image: string) {
    const imageKeys = getImageMatchKeys(image)
    const folders = findPackageFolders(root)
    const scored = folders.map((folder) => ({
        folder,
        score: Math.max(...imageKeys.map(({ key, bonus }) => packageMatchScore(key, folder, bonus))),
    }))

    return scored
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.folder.relativePath.localeCompare(right.folder.relativePath))
        .at(0)?.folder || null
}

function walkPackageFolders(root: string, relativePath: string, depth: number, folders: PackageFolder[]) {
    if (depth > MAX_SEARCH_DEPTH) return
    const directory = path.join(root, relativePath)
    const entries = readDirectory(directory)

    if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) {
        folders.push({
            directory,
            relativePath,
            name: readPackageName(path.join(directory, 'package.json')),
        })
    }

    for (const entry of entries) {
        if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue
        walkPackageFolders(root, path.join(relativePath, entry.name), depth + 1, folders)
    }
}

function getImageMatchKeys(image: string) {
    const seen = new Set<string>()
    const keys: Array<{ key: string, bonus: number }> = []
    for (const [value, bonus] of [[imageName(image), 0], ...containerNamesForImage(image).map((name) => [name, 25] as const)] as const) {
        const key = normalizeKey(value)
        if (!key || seen.has(key)) continue
        seen.add(key)
        keys.push({ key, bonus })
    }

    return keys
}

function containerNamesForImage(image: string) {
    try {
        return execSync('docker ps --format "{{.Image}}|{{.Names}}"', {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
            timeout: DOCKER_PS_TIMEOUT_MS,
        }).split('\n')
            .map((line) => line.trim().split('|'))
            .filter(([containerImage, name]) => containerImage === image && Boolean(name))
            .map(([, name]) => name)
    } catch {
        return []
    }
}

function packageMatchScore(imageKey: string, folder: PackageFolder, bonus: number) {
    const values = [
        normalizeKey(folder.name || ''),
        normalizeKey(path.basename(folder.directory)),
        normalizeKey(folder.relativePath),
    ]

    return values.includes(imageKey) ? 100 + bonus : 0
}

function readDirectory(directory: string) {
    try {
        return fs.readdirSync(directory, { withFileTypes: true })
    } catch {
        return []
    }
}

function readPackageName(packageJsonPath: string) {
    try {
        const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string }
        return typeof parsed.name === 'string' ? parsed.name : null
    } catch {
        return null
    }
}

function imageName(image: string) {
    const withoutDigest = image.split('@')[0]
    const withoutTag = withoutDigest.includes(':') ? withoutDigest.split(':').slice(0, -1).join(':') : withoutDigest
    const name = withoutTag.split('/').at(-1)
    return name || withoutTag
}

function normalizeKey(value: string) {
    const lower = value.toLowerCase()
    const normalized = lower.replace(/[^a-z0-9]/g, '')
    return normalized
}
