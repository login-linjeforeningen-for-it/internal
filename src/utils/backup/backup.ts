import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import config from '#config'
import getPostgresContainers from '#utils/backup/containers.ts'
import { getBackupDir, getContainerEnv } from '#utils/backup/utils.ts'

const execAsync = promisify(exec)

export async function runBackup() {
    try {
        const containers = await getPostgresContainers({ all: false })
        
        let s3: S3Client | null = null
        if (config.backup.s3 && config.backup.s3.endpoint && config.backup.s3.bucket) {
            s3 = new S3Client({
                endpoint: config.backup.s3.endpoint,
                region: config.backup.s3.region,
                credentials: {
                    accessKeyId: config.backup.s3.accessKey,
                    secretAccessKey: config.backup.s3.secretKey
                },
                forcePathStyle: true
            })
        }

        const projects = new Set<string>()

        await Promise.all(containers.map(async (container) => {
            const { id, name, project, workingDir } = container
            
            if (!project || !workingDir) return console.error(`\tMissing labels for ${name}`)

            try {
                const { DB, DB_USER, DB_PASSWORD } = await getContainerEnv(workingDir)
                if (!DB || !DB_USER || !DB_PASSWORD) throw new Error('Missing env vars')

                projects.add(project)
                const dir = getBackupDir(project)
                await fs.mkdir(dir, { recursive: true })

                const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(/\D/g, '')
                const file = path.join(dir, `${DB}_${stamp}.dump`)
                await execAsync(`docker exec -e PGPASSWORD="${DB_PASSWORD}" ${id} pg_dump -Fc -c -U "${DB_USER}" "${DB}" > "${file}"`)

                if ((await fs.stat(file)).size === 0) {
                    await fs.unlink(file).catch(() => { })
                    throw new Error('Empty backup')
                }
                console.log(`\tSaved: ${file}`)

                if (s3 && config.backup.s3.bucket) {
                    try {
                        await s3.send(new PutObjectCommand({
                            Bucket: config.backup.s3.bucket,
                            Key: `${project}/${path.basename(file)}`,
                            Body: createReadStream(file)
                        }))
                        console.log(`\tUploaded to S3: ${project}/${path.basename(file)}`)
                    } catch (e: any) {
                        console.error(`\tS3 Upload failed:`, e.message || e)
                    }
                }
            } catch (e: any) {
                console.error(`\tFailed ${name}:`, e.message || e)
            }
        }))

        const limit = Date.now() - (Number(config.backup.retention) || 7) * 86400000
        for (const p of projects) {
            const dir = getBackupDir(p)
            const files = await fs.readdir(dir).catch(() => [])
            for (const f of files) {
                const fp = path.join(dir, f)
                if ((await fs.stat(fp)).mtimeMs < limit) await fs.unlink(fp).catch(() => { })
            }
        }
    } catch (e: any) {
        console.error('\tBackup process failed:', e.message || e)
    }
}
