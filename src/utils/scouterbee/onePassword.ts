import { exec } from 'child_process'
import { sendSecretAlert } from './alerts.ts'
import { getScout, updateScout } from './state.ts'

const oneWeek = 7 * 24 * 60 * 60 * 1000
const oneMonth = 30 * 24 * 60 * 60 * 1000

type ItemField = { id: string, type: string, label: string, value: string, reference: string }
type Vault = { id: string, name: string }
type Item = { id: string, title: string }
type ItemDetail = { title: string, fields: ItemField[] }
type TokensWithExpire = { vault: string, item: string, fields: ItemField[] }

export async function runOnePasswordScout() {
    const startedAt = new Date().toISOString()
    await updateScout((draft) => {
        draft.onePassword.lastStartedAt = startedAt
        draft.onePassword.lastError = null
    })

    if (!process.env.ONEPASSWORD_TOKEN) {
        await updateScout((draft) => {
            draft.onePassword.enabled = false
            draft.onePassword.lastFinishedAt = new Date().toISOString()
            draft.onePassword.lastError = 'ONEPASSWORD_TOKEN is not configured'
        })
        return
    }

    try {
        const notified = getScout().onePassword.result?.categories ?? {
            hasExpired: [],
            expiresNextWeek: [],
            expiresNextMonth: []
        }
        const vaults = JSON.parse(await execCommand(`OP_SERVICE_ACCOUNT_TOKEN=${process.env.ONEPASSWORD_TOKEN} op vault list --format json`)) as Vault[]
        const tokensWithExpire: TokensWithExpire[] = []
        let itemCount = 0

        for (const vault of vaults) {
            const items = JSON.parse(await execCommand(`OP_SERVICE_ACCOUNT_TOKEN=${process.env.ONEPASSWORD_TOKEN} op item list --vault '${vault.name}' --format json`)) as Item[]
            itemCount += items.length
            for (const item of items) {
                const itemDetail = JSON.parse(await execCommand(`OP_SERVICE_ACCOUNT_TOKEN=${process.env.ONEPASSWORD_TOKEN} op item get '${item.id}' --vault '${vault.name}' --format json`)) as ItemDetail
                const matchingFields = itemDetail.fields.filter((field) =>
                    field.value?.toLowerCase().includes('expire') || field.reference?.toLowerCase().includes('expire')
                )
                if (matchingFields.length > 0) {
                    tokensWithExpire.push({ vault: vault.name, item: itemDetail.title, fields: matchingFields })
                }
            }
        }

        const categories = evaluateSecretExpirations(notified, tokensWithExpire)
        const report = prepareSecretReport(categories.newlyFound)
        let alertSent = false
        if (report?.secretsToReport) {
            await sendSecretAlert(report.ping, report.red, report.finalReport)
            alertSent = true
        }

        const now = Date.now()
        for (const level of ['hasExpired', 'expiresNextWeek', 'expiresNextMonth'] as const) {
            categories.current[level] = categories.current[level].filter((entry) => (now - entry.seen) < 24 * 60 * 60 * 1000)
        }

        const finishedAt = new Date().toISOString()
        await updateScout((draft) => {
            draft.onePassword.enabled = true
            draft.onePassword.lastFinishedAt = finishedAt
            draft.onePassword.lastSuccessAt = finishedAt
            draft.onePassword.result = {
                categories: categories.current,
                report,
                alertSent,
                vaultCount: vaults.length,
                itemCount
            }
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await updateScout((draft) => {
            draft.onePassword.lastFinishedAt = new Date().toISOString()
            draft.onePassword.lastError = message
        })
    }
}

function evaluateSecretExpirations(current: ExpiresAlert, tokensWithExpire: TokensWithExpire[]) {
    const now = Date.now()
    const newlyFound: ExpiresAlert = {
        hasExpired: [],
        expiresNextWeek: [],
        expiresNextMonth: []
    }
    const ranges: [keyof ExpiresAlert, (diff: number) => boolean][] = [
        ['hasExpired', (diff) => diff < 0],
        ['expiresNextWeek', (diff) => diff >= 0 && diff <= oneWeek],
        ['expiresNextMonth', (diff) => diff > oneWeek && diff <= oneMonth]
    ]

    for (const token of tokensWithExpire) {
        for (const field of token.fields) {
            if (field.type.toLowerCase() !== 'date') {
                continue
            }
            const fieldTime = new Date(Number(field.value) * 1000).getTime()
            const diff = fieldTime - now

            for (const [category, check] of ranges) {
                if (!check(diff)) {
                    continue
                }

                const nextItem: Expires = {
                    vault: token.vault,
                    title: token.item,
                    time: new Date(fieldTime).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' }),
                    seen: now
                }

                const exists = current[category].some((entry) => entry.vault === nextItem.vault && entry.title === nextItem.title)
                if (exists) {
                    break
                }

                for (const otherCategory of Object.keys(current) as (keyof ExpiresAlert)[]) {
                    if (otherCategory === category) {
                        continue
                    }
                    current[otherCategory] = current[otherCategory].filter((entry) => !(entry.vault === nextItem.vault && entry.title === nextItem.title))
                }

                current[category].push(nextItem)
                newlyFound[category].push(nextItem)
                break
            }
        }
    }

    return { current, newlyFound }
}

function prepareSecretReport(items: ExpiresAlert): SecretReport | null {
    let finalReport = ''
    let ping = false
    let red = false
    let secretsToReport = false

    if (items.hasExpired.length > 0) {
        secretsToReport = true
        finalReport += '🚨 **Has expired**\n'
    }
    for (const item of items.hasExpired) {
        const isProd = item.vault.includes('prod')
        if (isProd) {
            ping = true
        } else {
            red = true
        }
        finalReport += `${item.title} (${isProd ? 'prod' : 'dev'})\n${item.time}\n`
    }

    if (items.expiresNextWeek.length > 0) {
        secretsToReport = true
        finalReport += '🚨 **Expires in less than a week**\n'
    }
    for (const item of items.expiresNextWeek) {
        const isProd = item.vault.includes('prod')
        if (isProd) {
            ping = true
        }
        finalReport += `${item.title} (${isProd ? 'prod' : 'dev'})\n${item.time}\n`
    }

    if (items.expiresNextMonth.length > 0) {
        secretsToReport = true
        finalReport += '🚨 **Expires in less than a month**\n'
    }
    for (const item of items.expiresNextMonth) {
        const isProd = item.vault.includes('prod')
        finalReport += `${item.title} (${isProd ? 'prod' : 'dev'})\n${item.time}\n`
    }

    if (!secretsToReport) {
        return null
    }

    return { ping, red, finalReport, secretsToReport }
}

function execCommand(cmd: string) {
    return new Promise<string>((resolve, reject) => {
        exec(cmd, (error, stdout) => {
            if (error) {
                return reject(error)
            }
            resolve(stdout)
        })
    })
}
