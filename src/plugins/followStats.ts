import { WebSocket } from 'ws'
import os from 'os'
import { promisify } from 'util'
import { exec } from 'child_process'
const execAsync = promisify(exec)
import fs from 'fs/promises'

const SEND_INTERVAL = 2000

export default function followServerStats(connection: WebSocket) {
    async function sendStats() {
        try {
            // CPU load
            const load = os.loadavg()

            // Memory usage
            const totalMem = os.totalmem()
            const freeMem = os.freemem()
            const usedMem = totalMem - freeMem
            const memPercent = ((usedMem / totalMem) * 100).toFixed(2)

            // Swap
            let swapPercent = 'N/A'
            try {
                const swapData = await fs.readFile('/proc/meminfo', 'utf-8')
                const totalSwap = parseInt(swapData.match(/SwapTotal:\s+(\d+)/)?.[1] || '0', 10)
                const freeSwap = parseInt(swapData.match(/SwapFree:\s+(\d+)/)?.[1] || '0', 10)
                swapPercent = totalSwap > 0 ? (((totalSwap - freeSwap) / totalSwap) * 100).toFixed(2) : '0'
            } catch { /* ignore */ }

            // Disk usage
            let diskUsage = 'N/A'
            try {
                const { stdout } = await execAsync('df -h /')
                const lines = stdout.split('\n')
                if (lines.length > 1) {
                    const parts = lines[1].split(/\s+/)
                    diskUsage = `${parts[2]} used of ${parts[1]} (${parts[4]})`
                }
            } catch { /* ignore */ }

            // Temperature
            let temp = 'N/A'
            try {
                const { stdout } = await execAsync('sensors | grep -E "Package id 0|temp1" | head -n1')
                temp = stdout.split(':')[1]?.trim() || 'N/A'
            } catch { /* ignore */ }

            // Power usage
            let power = 'N/A'
            try {
                const { stdout } = await execAsync('cat /sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj')
                power = `${Number(stdout.trim()) / 1_000_000} J`
            } catch { /* ignore */ }

            // Processes
            const { stdout: psOut } = await execAsync('ps -e --no-headers | wc -l')
            const processes = parseInt(psOut.trim(), 10)

            // Network IPs
            const networkInterfaces = os.networkInterfaces()
            const ipv4 = Object.values(networkInterfaces)
                .flat()
                .filter((i): i is os.NetworkInterfaceInfo => !!i)
                .filter(i => i.family === 'IPv4' && !i.internal)
                .map(i => i.address)

            const ipv6 = Object.values(networkInterfaces)
                .flat()
                .filter((i): i is os.NetworkInterfaceInfo => !!i)
                .filter(i => i.family === 'IPv6' && !i.internal)
                .map(i => i.address)

            connection.send(JSON.stringify({
                type: 'server_stats',
                stats: {
                    load,
                    memory: { used: usedMem, total: totalMem, percent: memPercent },
                    swap: swapPercent,
                    disk: diskUsage,
                    temperature: temp,
                    powerUsage: power,
                    processes,
                    ipv4,
                    ipv6,
                    os: `${os.type()} ${os.release()} ${os.arch()}`
                }
            }))
        } catch (err) {
            console.warn('Failed to fetch server stats:', err)
        }
    }

    const interval = setInterval(sendStats, SEND_INTERVAL)
    sendStats()

    connection.on('close', () => {
        clearInterval(interval)
    })

    return {
        stop: () => clearInterval(interval)
    }
}
