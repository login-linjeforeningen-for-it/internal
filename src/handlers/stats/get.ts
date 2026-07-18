import { exec } from 'child_process'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { promisify } from 'util'
import os from 'os'
import fs from 'fs/promises'

const execAsync = promisify(exec)

export default async function getServerStats(_: FastifyRequest, res: FastifyReply) {
    try {
        // CPU Load (1,5,15 min averages)
        const load = os.loadavg()

        // Memory usage
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedMem = totalMem - freeMem
        const memPercent = ((usedMem / totalMem) * 100).toFixed(2)

        // Swap usage
        let swapPercent = 'N/A'
        try {
            const swapData = await fs.readFile('/proc/meminfo', 'utf-8')
            const totalSwap = parseInt(swapData.match(/SwapTotal:\s+(\d+)/)?.[1] || '0', 10)
            const freeSwap = parseInt(swapData.match(/SwapFree:\s+(\d+)/)?.[1] || '0', 10)
            if (totalSwap > 0) {
                swapPercent = (((totalSwap - freeSwap) / totalSwap) * 100).toFixed(2)
            } else swapPercent = '0'
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

        // Current power usage
        let power = 'N/A'
        try {
            const { stdout } = await execAsync('cat /sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj')
            power = `${Number(stdout.trim()) / 1_000_000} J`
        } catch { /* ignore */ }

        // Network IPs
        const networkInterfaces = os.networkInterfaces()
        const ipv4 = Object.values(networkInterfaces)
            .flat()
            .filter((i): i is os.NetworkInterfaceInfo => i !== undefined && i !== null)
            .filter(i => i.family === 'IPv4' && !i.internal)
            .map(i => i.address)
        const ipv6 = Object.values(networkInterfaces)
            .flat()
            .filter((i): i is os.NetworkInterfaceInfo => i !== undefined && i !== null)
            .filter(i => i.family === 'IPv6' && !i.internal)
            .map(i => i.address)

        // Processes
        const { stdout: psOut } = await execAsync('ps -e --no-headers | wc -l')
        const processes = parseInt(psOut.trim(), 10)

        res.send({
            system: {
                load,
                memory: { used: usedMem, total: totalMem, percent: memPercent },
                swap: swapPercent,
                disk: diskUsage,
                temperature: temp,
                powerUsage: power,
                processes,
                ipv4,
                ipv6,
                os: `${os.type()} ${os.release()} ${os.arch()}`,
            },
        })
    } catch (error) {
        return res.status(500).send({ error: (error as Error).message })
    }
}
