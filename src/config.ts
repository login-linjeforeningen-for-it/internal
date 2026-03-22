import path from 'path'
import { envLoad } from 'utilbee'

envLoad({ path: ['.env', '../.env'] })

const requiredEnvironmentVariables = [
    'S3_ENDPOINT',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET',
    'S3_REGION'
]

const missingVariables = requiredEnvironmentVariables
    .filter((key) => !process.env[key])
    .map((key) => `${key}: ${process.env[key] || 'undefined'}`)
    .join('\n    ')

if (missingVariables.length > 0) {
    throw new Error(`Missing essential environment variables:\n    ${missingVariables}`)
}

const env = Object.fromEntries(
    requiredEnvironmentVariables.map((key) => [key, process.env[key]])
)

const config = {
    userinfo: 'https://authentik.login.no/application/o/userinfo/',
    tekkom: 'TekKom',
    backup: {
        path: '/home/dev/backups',
        schedule: '0 22 * * *',
        retention: 7,
        s3: {
            endpoint: process.env.S3_ENDPOINT || '',
            accessKey: process.env.S3_ACCESS_KEY || '',
            secretKey: process.env.S3_SECRET_KEY || '',
            bucket: process.env.S3_BUCKET || '',
            region: process.env.S3_REGION || ''
        }
    },
    vulnerability: {
        path: path.join(process.cwd(), 'data', 'vulnerabilities.json'),
        schedule: '0 14 * * *'
    }
}

export default config
