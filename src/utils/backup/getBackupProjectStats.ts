import config from '#config'
import { createBackupS3Clients, listBackupObjectsFromS3 } from '#utils/backup/s3.ts'

export type BackupProjectStats = {
    size: number
    time: number
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

async function collectStatsFromS3(
    s3: ReturnType<typeof createBackupS3Clients>['localS3'],
    extension: string
) {
    const statsByProject = new Map<string, BackupProjectStats>()

    const backupObjects = await listBackupObjectsFromS3({
        s3,
        extension,
        onError: (error) => {
            console.error('Failed to list backup project stats:', error)
        },
    })

    for (const object of backupObjects) {
        const current = statsByProject.get(object.project) || { size: 0, time: 0 }
        statsByProject.set(object.project, {
            size: current.size + object.size,
            time: Math.max(current.time, object.lastModifiedMs),
        })
    }

    return statsByProject
}

export default async function getBackupProjectStats() {
    const extension = config.backup.encryption.extension
    const { localS3, remoteS3 } = createBackupS3Clients()

    const [localStats, remoteStats] = await Promise.all([
        collectStatsFromS3(localS3, extension),
        collectStatsFromS3(remoteS3, extension),
    ])

    const statsByProject = new Map<string, BackupProjectStats>()
    mergeStats(statsByProject, localStats)
    mergeStats(statsByProject, remoteStats)

    return statsByProject
}
