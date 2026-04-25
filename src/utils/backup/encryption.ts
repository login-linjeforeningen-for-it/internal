import fs from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto'
import { pipeline } from 'stream/promises'
import config from '#config'

const ALGORITHM = 'aes-256-gcm'
const MAGIC = Buffer.from('TKB1')
const SALT_LENGTH = 16
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const HEADER_LENGTH = MAGIC.length + SALT_LENGTH + IV_LENGTH
const MIN_PASSPHRASE_LENGTH = 16
const SCRYPT_OPTIONS = {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
} as const

function getEncryptionKey() {
    return config.backup.encryption.key || ''
}

function ensureEncryptionKey() {
    const key = getEncryptionKey().trim()
    if (!key) {
        throw new Error('Backup encryption key is not configured')
    }
    if (key.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Backup encryption key must be at least ${MIN_PASSPHRASE_LENGTH} characters`)
    }
    return key
}

async function deriveKey(passphrase: string, salt: Buffer) {
    return await new Promise<Buffer>((resolve, reject) => {
        scrypt(passphrase, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
            if (error) {
                reject(error)
                return
            }
            resolve(key as Buffer)
        })
    })
}

async function readHeader(filePath: string) {
    const handle = await fs.open(filePath, 'r')
    try {
        const header = Buffer.alloc(HEADER_LENGTH)
        const read = await handle.read(header, 0, HEADER_LENGTH, 0)
        if (read.bytesRead < HEADER_LENGTH) {
            throw new Error('Invalid encrypted backup header')
        }
        if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
            throw new Error('Unknown encrypted backup format')
        }

        return {
            salt: header.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH),
            iv: header.subarray(MAGIC.length + SALT_LENGTH, HEADER_LENGTH)
        }
    } finally {
        await handle.close()
    }
}

async function readAuthTag(filePath: string, size: number) {
    const handle = await fs.open(filePath, 'r')
    try {
        const tag = Buffer.alloc(AUTH_TAG_LENGTH)
        const read = await handle.read(tag, 0, AUTH_TAG_LENGTH, size - AUTH_TAG_LENGTH)
        if (read.bytesRead < AUTH_TAG_LENGTH) {
            throw new Error('Invalid encrypted backup auth tag')
        }
        return tag
    } finally {
        await handle.close()
    }
}

export function isBackupEncryptionEnabled() {
    return config.backup.encryption.enabled
}

export async function isEncryptedBackupFile(filePath: string) {
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null
    try {
        handle = await fs.open(filePath, 'r')
        const magic = Buffer.alloc(MAGIC.length)
        const read = await handle.read(magic, 0, MAGIC.length, 0)
        return read.bytesRead === MAGIC.length && magic.equals(MAGIC)
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return false
        }
        throw new Error(`Failed to inspect backup file encryption: ${error?.message || 'unknown error'}`)
    } finally {
        await handle?.close().catch(() => {})
    }
}

export async function encryptBackupFile(filePath: string) {
    if (!isBackupEncryptionEnabled()) {
        return filePath
    }

    const passphrase = ensureEncryptionKey()
    const salt = randomBytes(SALT_LENGTH)
    const iv = randomBytes(IV_LENGTH)
    const key = await deriveKey(passphrase, salt)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    const encryptedPath = `${filePath}.enc`
    const tempPath = `${encryptedPath}.tmp`
    await fs.unlink(tempPath).catch(() => {})

    const output = createWriteStream(tempPath, { flags: 'w' })

    try {
        await new Promise<void>((resolve, reject) => {
            output.once('error', reject)
            output.write(Buffer.concat([MAGIC, salt, iv]), (error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve()
            })
        })

        await pipeline(createReadStream(filePath), cipher, output)
        await fs.appendFile(tempPath, cipher.getAuthTag())
        await fs.rename(tempPath, encryptedPath)
        await fs.unlink(filePath).catch(() => {})

        return encryptedPath
    } catch (error) {
        await fs.unlink(tempPath).catch(() => {})
        throw error
    }
}

export async function decryptBackupFile(
    filePath: string,
    outputPath: string,
    options?: { allowUnencryptedInput?: boolean }
) {
    if (!(await isEncryptedBackupFile(filePath))) {
        if (options?.allowUnencryptedInput) {
            return filePath
        }
        throw new Error('Backup file is not encrypted')
    }

    const passphrase = ensureEncryptionKey()
    const stat = await fs.stat(filePath)
    if (stat.size <= HEADER_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('Encrypted backup file is too small')
    }

    const { salt, iv } = await readHeader(filePath)
    const authTag = await readAuthTag(filePath, stat.size)
    const key = await deriveKey(passphrase, salt)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const tempPath = `${outputPath}.tmp`
    await fs.unlink(tempPath).catch(() => {})

    try {
        await pipeline(
            createReadStream(filePath, { start: HEADER_LENGTH, end: stat.size - AUTH_TAG_LENGTH - 1 }),
            decipher,
            createWriteStream(tempPath, { flags: 'w' })
        )

        await fs.rename(tempPath, outputPath)
        return outputPath
    } catch (error) {
        await fs.unlink(tempPath).catch(() => {})
        throw new Error('Failed to decrypt backup file')
    }
}