import type { FastifyReply, FastifyRequest } from "fastify"
import { readFile } from "fs/promises"

const NGINX_CONFIG_CANDIDATES = [
    "/usr/local/openresty/nginx/sites-enabled/default",
    "/usr/local/openresty/nginx/sites-available/default.conf",
    "/usr/local/openresty/nginx/conf/nginx.conf",
    "/etc/nginx/sites-enabled/default",
    "/etc/nginx/sites-available/default",
]

export default async function getIngress(req: FastifyRequest, res: FastifyReply) {
    const { port } = req.params as { port: string }

    try {
        const { filePath, data } = await readFirstConfig()
        const parsed = parseContent(data)
        return res.send({ port, filePath, parsed })
    } catch (error) {
        console.log(error)
        return res.status(500).send({ error: (error as Error).message })
    }
}

async function readFirstConfig() {
    const errors: string[] = []

    for (const filePath of NGINX_CONFIG_CANDIDATES) {
        try {
            const data = await readFile(filePath, "utf8")
            return { filePath, data }
        } catch (error) {
            errors.push(`${filePath}: ${(error as Error).message}`)
        }
    }

    throw new Error(`Unable to read nginx config. Tried ${errors.join("; ")}`)
}

function parseContent(text: string) {
    return text.split("\n").map(line => line.trim())
}
