import config from '#config'
import { S3Client } from 'bun'

export type BackupProjectStats = {
    size: number
    time: number
}

type S3Target = {
    endpoint: string
    accessKey: string
    secretKey: string
    bucket: string
    region?: string
}

function createS3Client(target: S3Target, remote = false) {
    if (!target.endpoint || !target.bucket) {
        return null
    }

    return new S3Client({
        endpoint: target.endpoint,
        ...(remote ? { region: target.region } : {}),
        accessKeyId: target.accessKey,
        secretAccessKey: target.secretKey,
        bucket: target.bucket,
    })
}

function mergeStats(target: Map<string, BackupProjectStats>, source: Map<string, BackupProjectStats>) {
    for (const [project, stats] of source) {
        const current = target.get(project) || { size: 0, time: 0 }
        target.set(project, {
            size: current.size + stats.size,
            time: Math.max(current.time, stats.time),
        })
    }
}

async function collectStatsFromS3(s3: S3Client | null, extension: string) {
    const statsByProject = new Map<string, BackupProjectStats>()

    if (!s3) {
        return statsByProject
    }

    try {
        const response = await s3.list()
        if (!response.contents) {
            return statsByProject
        }

        for (const obj of response.contents) {
            if (!obj.key || !obj.lastModified || !obj.size || obj.size <= 0) continue
            const parts = obj.key.split('/')
            if (parts.length !== 2) continue
            const [project, filename] = parts
            if (!filename.endsWith(extension)) continue

            const current = statsByProject.get(project) || { size: 0, time: 0 }
            const lastModifiedMs = new Date(obj.lastModified).getTime()
            statsByProject.set(project, {
                size: current.size + obj.size,
                time: Math.max(current.time, Number.isFinite(lastModifiedMs) ? lastModifiedMs : 0),
            })
        }
    } catch (error) {
        console.error('Failed to list backup project stats:', error)
    }

    return statsByProject
}

export default async function getBackupProjectStats() {
    const extension = config.backup.encryption.extension
    const localS3 = createS3Client(config.backup.s3_local)
    const remoteS3 = createS3Client(config.backup.s3_remote, true)

    const [localStats, remoteStats] = await Promise.all([
        collectStatsFromS3(localS3, extension),
        collectStatsFromS3(remoteS3, extension),
    ])

    const statsByProject = new Map<string, BackupProjectStats>()
    mergeStats(statsByProject, localStats)
    mergeStats(statsByProject, remoteStats)

    return statsByProject
}