import config from '#config'
import fs from 'node:fs/promises'

const AGE_BINARY = process.env.BACKUP_AGE_BINARY || 'age'

type RunAgeResult = { stdout: string; stderr: string; code: number }

async function runAge(args: string[]): Promise<RunAgeResult> {
    let proc: any
    try {
        proc = Bun.spawn([AGE_BINARY, ...args])
    } catch (err) {
        throw new Error(`failed to spawn ${AGE_BINARY}: ${String(err)}`)
    }

    const stdoutPromise = new Response(proc.stdout).text()
    const stderrPromise = new Response(proc.stderr).text()
    const [stdout, stderr, code] = await Promise.all([stdoutPromise, stderrPromise, proc.exited])

    if (code !== 0) {
        const err = new Error((stderr || `age exited with code ${code}`).trim()) as Error & { code?: number; stdout?: string; stderr?: string }
        err.code = code
        err.stdout = stdout
        err.stderr = stderr
        throw err
    }

    return { stdout, stderr, code }
}

export async function encryptBackupFile(filePath: string): Promise<string> {
    const source = Bun.file(filePath)
    if (!(await source.exists())) throw new Error('Source file does not exist')
    if (filePath.endsWith('.age')) throw new Error('File already appears to be encrypted')
        
    const publicKey = config.backup.encryption.publicKey
    if (!publicKey) throw new Error('No age public key configured for backup encryption')

    const encryptedPath = `${filePath}${config.backup.encryption.extension}`
    const tempPath = `${encryptedPath}.tmp`

    await Bun.file(tempPath).delete().catch(() => {})

    try {
        await runAge(['--recipient', publicKey, '--output', tempPath, filePath])

        if (!(await Bun.file(tempPath).exists())) throw new Error('age did not produce an output file')

        try {
            await fs.rename(tempPath, encryptedPath)
        } catch (error: any) {
            if (error?.code === 'EEXIST') {
                await fs.unlink(encryptedPath)
                await fs.rename(tempPath, encryptedPath)
            } else {
                throw error
            }
        }

        await source.delete().catch(() => {})

        return encryptedPath
    } catch (error) {
        await Bun.file(tempPath).delete().catch(() => {})
        throw error
    }
}
