import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import type { NpmAuditReport } from './npmAuditTypes.ts'

const NPM_AUDIT_TIMEOUT_MS = 600_000
const NPM_LOCK_TIMEOUT_MS = 600_000

export default function runNpmAudit(directory: string): NpmAuditReport {
    const auditDirectory = fs.existsSync(path.join(directory, 'package-lock.json'))
        ? directory
        : prepareAuditDirectory(directory)

    try {
        const output = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
            cwd: auditDirectory,
            encoding: 'utf8',
            env: npmEnv(),
            maxBuffer: 16 * 1024 * 1024,
            timeout: NPM_AUDIT_TIMEOUT_MS,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        return parseAuditOutput(output)
    } catch (error) {
        return parseAuditError(error)
    } finally {
        if (auditDirectory !== directory) {
            fs.rmSync(auditDirectory, { recursive: true, force: true })
        }
    }
}

export function formatAuditSkipReason(error: any) {
    if (error?.killed || error?.signal || error?.code === 'ETIMEDOUT') {
        return 'timed out'
    }

    return String(error?.message || error || 'unknown reason').split('\n')[0]
}

function prepareAuditDirectory(directory: string) {
    const auditDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-audit-'))
    fs.copyFileSync(path.join(directory, 'package.json'), path.join(auditDirectory, 'package.json'))
    execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps'], {
        cwd: auditDirectory,
        encoding: 'utf8',
        env: npmEnv(),
        maxBuffer: 16 * 1024 * 1024,
        timeout: NPM_LOCK_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    return auditDirectory
}

function parseAuditOutput(output: string): NpmAuditReport {
    if (!output.trim()) {
        throw new Error('npm audit returned empty output.')
    }

    return JSON.parse(output) as NpmAuditReport
}

function parseAuditError(error: unknown): NpmAuditReport {
    const auditError = error as { stdout?: string | Buffer }
    if (!auditError.stdout) throw error
    const output = Buffer.isBuffer(auditError.stdout) ? auditError.stdout.toString('utf8') : auditError.stdout
    return parseAuditOutput(output)
}

function npmEnv() {
    const nodeOptions = `${process.env.NODE_OPTIONS || ''} --max-old-space-size=192`.trim()
    return {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
    }
}
