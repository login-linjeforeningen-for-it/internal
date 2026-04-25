#!/usr/bin/env bun

import fs from 'fs/promises'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import getDeployTargets from '../src/utils/deploy/getDeployTargets.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const systemdSourceDir = path.join(repoRoot, 'systemd')
const systemdTargetDir = '/etc/systemd/system'
const envTargetDir = '/etc/login-deploy'
const deployUser = process.env.DEPLOY_USER || process.env.SUDO_USER || process.env.USER || 'ubuntu'
const enableTimers = process.argv.includes('--enable')

async function copySystemdTemplate(filename: string) {
    await fs.copyFile(
        path.join(systemdSourceDir, filename),
        path.join(systemdTargetDir, filename)
    )
}

async function writeEnvironmentFiles() {
    await fs.mkdir(envTargetDir, { recursive: true })

    for (const target of getDeployTargets()) {
        const envFile = [
            `DEPLOY_USER=${deployUser}`,
            `REPO_PATH=${target.repoPath}`,
            `DEPLOY_BRANCH=${target.branch}`,
            `DEPLOY_COMPOSE_COMMAND='${target.composeCommand.replace(/'/g, `'\"'\"'`)}'`,
            ''
        ].join('\n')

        await fs.writeFile(path.join(envTargetDir, `${target.id}.env`), envFile, 'utf8')
    }
}

async function main() {
    if (typeof process.getuid === 'function' && process.getuid() !== 0) {
        throw new Error('Run this script as root, for example with: sudo bun scripts/installDeployUnits.ts')
    }

    await copySystemdTemplate('login-deploy@.service')
    await copySystemdTemplate('login-deploy@.timer')
    await writeEnvironmentFiles()

    execFileSync('systemctl', ['daemon-reload'], { stdio: 'inherit' })

    if (enableTimers) {
        for (const target of getDeployTargets()) {
            execFileSync('systemctl', ['enable', '--now', `login-deploy@${target.id}.timer`], { stdio: 'inherit' })
        }
    }

    console.log(`Installed deploy templates for ${getDeployTargets().length} target(s).`)
}

await main()
