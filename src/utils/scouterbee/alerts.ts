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
