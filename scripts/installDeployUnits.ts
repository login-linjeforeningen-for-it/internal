#!/usr/bin/env bun

import fs from 'fs/promises'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import getDeployTargets from '../src/utils/deploy/getDeployTargets.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const systemdSourceDir = path.join(repoRoot, 'systemd')
const homeDir = process.env.HOME || path.dirname(repoRoot)
const systemdTargetDir = path.join(homeDir, '.config/systemd/user')
const envTargetDir = path.join(homeDir, '.config/login-deploy')
const enableTimers = process.argv.includes('--enable')

async function copySystemdTemplate(filename: string) {
    await fs.mkdir(systemdTargetDir, { recursive: true })
    await fs.copyFile(
        path.join(systemdSourceDir, filename),
        path.join(systemdTargetDir, filename)
    )
}

async function writeEnvironmentFiles() {
    await fs.mkdir(envTargetDir, { recursive: true })

    for (const target of getDeployTargets()) {
        const envFile = [
            `REPO_PATH=${target.repoPath}`,
            `DEPLOY_BRANCH=${target.branch}`,
            `DEPLOY_COMPOSE_COMMAND='${target.composeCommand.replace(/'/g, `'\"'\"'`)}'`,
            ''
        ].join('\n')

        await fs.writeFile(path.join(envTargetDir, `${target.id}.env`), envFile, 'utf8')
    }
}

async function main() {
    await copySystemdTemplate('login-deploy@.service')
    await copySystemdTemplate('login-deploy@.timer')
    await writeEnvironmentFiles()

    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' })

    if (enableTimers) {
        for (const target of getDeployTargets()) {
            execFileSync('systemctl', ['--user', 'enable', '--now', `login-deploy@${target.id}.timer`], { stdio: 'inherit' })
        }
    }

    console.log(`Installed deploy templates for ${getDeployTargets().length} target(s).`)
}

await main()
