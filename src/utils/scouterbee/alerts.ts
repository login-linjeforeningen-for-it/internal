import config from '#config'

export async function sendProjectAlert(finalReport: {
    title: string
    description: string
    highestSeverity: 'critical' | 'high' | 'medium'
}) {
    if (!config.scout.webhookUrl) {
        return
    }

    const data: { content?: string, embeds: object[] } = {
        embeds: [
            {
                title: finalReport.title,
                description: finalReport.description,
                color: finalReport.highestSeverity === 'critical' ? 0x800080 : 0xff0000,
                timestamp: new Date().toISOString()
            }
        ]
    }

    if (finalReport.highestSeverity === 'critical' && config.scout.criticalDevelopmentRole) {
        data.content = `🐝 <@&${config.scout.criticalDevelopmentRole}> 🐝`
    }

    const response = await fetch(config.scout.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })

    if (!response.ok) {
        throw new Error(await response.text())
    }
}

export async function sendSecretAlert(ping: boolean, red: boolean, finalReport: string) {
    if (!config.scout.webhookUrl) {
        return
    }

    const data: { content?: string, embeds: object[] } = {
        embeds: [
            {
                title: '🐝 Secret Report 🐝',
                description: finalReport,
                color: ping || red ? 0xff0000 : 0xfd8738,
                timestamp: new Date().toISOString()
            }
        ]
    }

    if (ping && config.scout.criticalRole) {
        data.content = `🐝 <@&${config.scout.criticalRole}> 🐝`
    }

    const response = await fetch(config.scout.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })

    if (!response.ok) {
        throw new Error(await response.text())
    }
}
