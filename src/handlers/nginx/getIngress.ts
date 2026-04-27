import type { FastifyReply, FastifyRequest } from "fastify"
import { readFile } from "fs/promises"
const DEFAULT_NGINX_CONFIG = "/etc/nginx/sites-available/default"

export default async function getIngress(req: FastifyRequest, res: FastifyReply) {
    const { port } = req.params as { port: string }

    try {
        const filePath = DEFAULT_NGINX_CONFIG
        const data = await readFile(filePath, "utf8")
        const parsed = parseContent(data)
        return res.send({ port, filePath, parsed })
    } catch (error) {
        console.log(error)
        return res.status(500).send({ error: (error as Error).message })
    }
}

function parseContent(text: string) {
    return text.split("\n").map(line => line.trim())
}
