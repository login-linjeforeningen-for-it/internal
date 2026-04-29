import runProcessText from './runProcessText.ts'

const DOCKER_SCOUT_QUICKVIEW_TIMEOUT_SECONDS = 120

export default async function runDockerScoutQuickviewRaw(image: string) {
    const { stdout, stderr } = await runProcessText([
        'docker',
        'scout',
        'quickview',
        image,
    ], {
        maxBuffer: 10 * 1024 * 1024,
        timeoutMs: DOCKER_SCOUT_QUICKVIEW_TIMEOUT_SECONDS * 1000,
    })
    return `${stdout}${stderr}`
}
