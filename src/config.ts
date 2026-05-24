import { envLoad } from 'utilbee'

envLoad({ path: ['.env', '../.env'] })

const requiredEnvironmentVariables = [
    'S3_ENDPOINT',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET',
    'S3_REGION',
    'S3_LOCAL_ENDPOINT',
    'S3_LOCAL_ACCESS_KEY',
    'S3_LOCAL_SECRET_KEY',
    'S3_LOCAL_BUCKET',
    'BACKUP_ENCRYPTED_EXTENSION',
    'BACKUP_AGE_PUBLIC_KEY',
    'LOG_ALERTS_WEBHOOK_URL'
]

const missingVariables = requiredEnvironmentVariables
    .filter((key) => !process.env[key])
    .map((key) => `${key}: ${process.env[key] || 'undefined'}`)
    .join('\n    ')

if (missingVariables.length > 0) {
    throw new Error(`Missing essential environment variables:\n    ${missingVariables}`)
}

const env = process.env as Record<string, string | undefined>

const config = {
    userinfo: env.AUTHENTIK_USERINFO_URL
        || (env.AUTHENTIK_URL
            ? `${env.AUTHENTIK_URL}/application/o/userinfo/`
            : 'https://authentik.login.no/application/o/userinfo/'),
    login: {
        tekkom: 'TekKom',
        color: 0xfd8738
    },
    backup: {
        path: env.BACKUP_PATH || '/backups',
        schedule: '0 22 * * *',
        retention: 7,
        encryption: {
            publicKey: env.BACKUP_AGE_PUBLIC_KEY,
            extension: env.BACKUP_ENCRYPTED_EXTENSION || '.age'
        },
        s3_remote: {
            endpoint: env.S3_ENDPOINT || '',
            accessKey: env.S3_ACCESS_KEY || '',
            secretKey: env.S3_SECRET_KEY || '',
            bucket: env.S3_BUCKET || '',
            region: env.S3_REGION || ''
        },
        s3_local: {
            endpoint: env.S3_LOCAL_ENDPOINT || '',
            accessKey: env.S3_LOCAL_ACCESS_KEY || '',
            secretKey: env.S3_LOCAL_SECRET_KEY || '',
            bucket: env.S3_LOCAL_BUCKET || '',
        }
    },
    vulnerability: {
        schedule: '0 2 * * *'
    },
    scout: {
        webhookUrl: env.WEBHOOK_URL || '',
        role: env.CRITICAL_ROLE || '',
    },
    queenbee: {
        url: env.QUEENBEE_URL || 'https://queenbee.login.no',
    },
    logs: {
        fingerprint: {
            ms: 24 * 60 * 60 * 1000
        },
        alerts: {
            enabled: (env.LOG_ALERTS_ENABLED || 'true') !== 'false',
            webhook: env.LOG_ALERTS_WEBHOOK_URL,
            threadId: env.LOG_ALERTS_THREAD_ID || '1484122179665788990',
            schedule: env.LOG_ALERTS_SCHEDULE || '*/1 * * * *',
        },
    },
    docker: {
        options: { maxBuffer: 12 * 1024 * 1024, timeout: 5000 },
        tail: 500
    },
    service: {
        beekeeperToken: process.env.BEEKEEPER_TOKEN || process.env.INTERNAL_TOKEN || ''
    }
}

export default config
