import { existsSync } from 'fs'
import getDeployTargets from '#utils/deploy/getDeployTargets.ts'
import readTailFile from './readTailFile'
import readFirstExistingFile from './readFirstExistingFile'
import getHistoryCandidates from './getHistoryCandidates'
import finalizeEntries from './finalizeEntries'
import safeExec from './safeExec'
import parseEntries from './parseEntries'
import filterEntries from './filterEntries'

export default async function getHostLogSources({
    tail,
    level,
    search,
}: {
    tail: number
    level: 'all' | 'error'
    search: string
}): Promise<CollectedLogSource[]> {
    const authLog = existsSync('/var/log/auth.log')
        ? readTailFile('/var/log/auth.log', tail)
        : readTailFile('/var/log/secure', tail)
    const syslog = existsSync('/var/log/syslog')
        ? readTailFile('/var/log/syslog', tail)
        : readTailFile('/var/log/messages', tail)
    const nginxErrorLog = readFirstExistingFile([
        '/var/log/nginx/error.log',
        '/opt/homebrew/var/log/nginx/error.log',
        '/usr/local/var/log/nginx/error.log',
    ], tail)
    const nginxAccessLog = readFirstExistingFile([
        '/var/log/nginx/access.log',
        '/opt/homebrew/var/log/nginx/access.log',
        '/usr/local/var/log/nginx/access.log',
    ], tail)
    const fail2banLog = readFirstExistingFile([
        '/var/log/fail2ban.log',
    ], tail)
    const history = getHistoryCandidates()
        .map(path => readTailFile(path, Math.max(50, Math.floor(tail / 2))))
        .filter(Boolean)
        .join('\n')
    const sshAttemptsLog = [authLog, syslog]
        .filter(Boolean)
        .flatMap(content => content.split('\n'))
        .filter(line => /sshd|Failed password|Invalid user|authentication failure|Disconnected from invalid user|Did not receive identification string/i.test(line))
        .join('\n')

    const [journal, sshJournal, dockerJournal, kernelJournal, fail2banJournal] = await Promise.all([
        safeExec(`journalctl -p err --since "24 hours ago" --no-pager -n ${tail} -o short-iso`),
        safeExec(`journalctl --since "7 days ago" --no-pager -n ${tail} -u ssh -u sshd -o short-iso`),
        safeExec(`journalctl --since "24 hours ago" --no-pager -n ${tail} -u docker -o short-iso`),
        safeExec(`journalctl -k --since "24 hours ago" --no-pager -n ${tail} -o short-iso`),
        safeExec(`journalctl --since "7 days ago" --no-pager -n ${tail} -u fail2ban -o short-iso`),
    ])
    const deploySources = await Promise.all(getDeployTargets().map(async (target) => ({
        id: `deploy-${target.id}`,
        name: `${target.name} deploy`,
        service: target.id,
        status: 'systemd',
        sourceType: 'deployment' as const,
        raw: await safeExec(`journalctl --since "7 days ago" --no-pager -n ${tail} -u login-deploy@${target.id}.service -o short-iso`),
    })))

    const sources: LogSource[] = [
        {
            id: 'host-journal',
            name: 'System journal',
            service: 'host',
            status: 'systemd',
            raw: journal,
            sourceType: 'journal',
        },
        {
            id: 'host-syslog',
            name: 'System log',
            service: 'host',
            status: 'file',
            raw: syslog,
            sourceType: 'file',
        },
        {
            id: 'host-auth',
            name: 'Authentication log',
            service: 'security',
            status: 'file',
            raw: authLog,
            sourceType: 'file',
        },
        {
            id: 'host-ssh-journal',
            name: 'SSH journal',
            service: 'security',
            status: 'systemd',
            raw: sshJournal,
            sourceType: 'journal',
        },
        {
            id: 'host-ssh-attempts',
            name: 'SSH attempts',
            service: 'security',
            status: 'file+journal',
            raw: [sshAttemptsLog, sshJournal].filter(Boolean).join('\n'),
            sourceType: 'journal',
        },
        {
            id: 'host-docker-journal',
            name: 'Docker daemon journal',
            service: 'docker',
            status: 'systemd',
            raw: dockerJournal,
            sourceType: 'journal',
        },
        {
            id: 'host-kernel-journal',
            name: 'Kernel journal',
            service: 'kernel',
            status: 'systemd',
            raw: kernelJournal,
            sourceType: 'journal',
        },
        {
            id: 'host-nginx-error',
            name: 'Nginx error log',
            service: 'nginx',
            status: 'file',
            raw: nginxErrorLog,
            sourceType: 'file',
        },
        {
            id: 'host-nginx-access',
            name: 'Nginx access log',
            service: 'nginx',
            status: 'file',
            raw: nginxAccessLog,
            sourceType: 'file',
        },
        {
            id: 'host-fail2ban',
            name: 'Fail2ban log',
            service: 'security',
            status: 'file',
            raw: fail2banLog,
            sourceType: 'file',
        },
        {
            id: 'host-fail2ban-journal',
            name: 'Fail2ban journal',
            service: 'security',
            status: 'systemd',
            raw: fail2banJournal,
            sourceType: 'journal',
        },
        {
            id: 'host-history',
            name: 'Shell history',
            service: 'shell',
            status: 'history',
            raw: history,
            sourceType: 'history',
        },
        ...deploySources,
    ]

    return sources.map(source => {
        const entries = finalizeEntries(
            filterEntries(parseEntries(source.raw), { level, search }).slice(-50),
            source.id
        )
        return {
            id: source.id,
            name: source.name,
            service: source.service,
            status: source.status,
            sourceType: source.sourceType,
            matchedLines: entries.length,
            entries,
        }
    })
}
