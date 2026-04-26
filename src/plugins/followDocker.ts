import { spawn } from 'child_process'
import { WebSocket } from 'ws'

export default async function followDockerStats(connection: WebSocket) {
    const dockerStats = spawn('docker', ['stats', '--no-stream=false', '--format',
        '{{.Container}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}'
    ], {
        cwd: process.env.HOME,
        env: process.env
    })

    let buffer = ''
    dockerStats.stdout.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        const stats = lines.map(line => {
            const [containerId, name, cpu, memUsage, memPerc, netIO, blockIO, pids] = line.split('|')
            return {
                containerId,
                name,
                cpu,
                memUsage,
                memPerc,
                netIO,
                blockIO,
                pids: Number(pids)
            }
        })

        if (stats.length > 0) {
            try {
                connection.send(JSON.stringify({ type: 'docker_stats', containers: stats }))
            } catch (err) {
                console.warn('Failed to send docker stats:', err)
            }
        }
    })

    dockerStats.stderr.on('data', (data) => {
        connection.send(JSON.stringify({
            type: 'docker_stats_error',
            message: data.toString().trim()
        }))
    })

    dockerStats.on('exit', (exitCode) => {
        connection.send(JSON.stringify({
            type: 'docker_stats_exit',
            code: exitCode
        }))
    })

    connection.on('close', () => {
        dockerStats.kill()
    })

    return {
        kill: () => dockerStats.kill()
    }
}
