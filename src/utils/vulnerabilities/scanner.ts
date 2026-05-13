const TIMEOUT_MS = 15 * 60 * 1000

export async function scanImage(image: string): Promise<ImageVulnerabilityReport> {
    const scannedAt = new Date().toISOString()

    try {
        const vulnerabilities = await runScout(image)
        const severity = tally(vulnerabilities)
        return {
            image,
            scannedAt,
            totalVulnerabilities: vulnerabilities.length,
            severity,
            groups: buildGroups(vulnerabilities),
            vulnerabilities,
            scannerResults: [{ scanner: 'docker_scout', scannedAt, totalVulnerabilities: vulnerabilities.length, severity, scanError: null, summaryOnly: false, note: null }],
            scanError: null,
        }
    } catch (err: any) {
        const scanError = String(err?.message || err)
        const severity = emptySeverity()
        return {
            image,
            scannedAt,
            totalVulnerabilities: 0,
            severity,
            groups: [],
            vulnerabilities: [],
            scannerResults: [{ scanner: 'docker_scout', scannedAt, totalVulnerabilities: 0, severity, scanError, summaryOnly: false, note: null }],
            scanError,
        }
    }
}

async function runScout(image: string): Promise<VulnerabilityDetail[]> {
    const proc = Bun.spawn(
        ['docker', 'scout', 'cves', `local://${image}`, '--format', 'sarif'],
        { stdout: 'pipe', stderr: 'pipe' }
    )

    let killed = false
    const timer = setTimeout(() => { killed = true; proc.kill('SIGTERM') }, TIMEOUT_MS)

    try {
        const [stdout, stderr, code] = await Promise.all([
            readAll(proc.stdout),
            readAll(proc.stderr),
            proc.exited,
        ])

        if (killed) throw new Error(`docker scout timed out after ${TIMEOUT_MS / 1000}s`)
        if (code !== 0) throw new Error(stderr.trim() || `docker scout exited with code ${code}`)

        return parseSarif(stdout)
    } finally {
        clearTimeout(timer)
    }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
    }
    return new TextDecoder().decode(Buffer.concat(chunks))
}

function parseSarif(raw: string): VulnerabilityDetail[] {
    const trimmed = raw.trim()
    if (!trimmed) return []

    const start = trimmed.indexOf('{')
    if (start < 0) return []

    const sarif = JSON.parse(trimmed.slice(start))
    const runs: any[] = Array.isArray(sarif?.runs) ? sarif.runs : []

    const details = runs.flatMap(run => {
        const rules = new Map<string, any>(
            (run?.tool?.driver?.rules ?? []).map((r: any) => [r.id, r])
        )
        return (run?.results ?? []).map((result: any) => toDetail(result, rules.get(result?.ruleId)))
    }).filter(Boolean) as VulnerabilityDetail[]

    const SEVERITY_ORDER: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'unknown']
    return details.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
}

function toDetail(result: any, rule: any): VulnerabilityDetail | null {
    if (!result && !rule) return null

    const props = rule?.properties ?? {}
    const purl: string | null = Array.isArray(props.purls) ? props.purls[0] ?? null : null
    const pkg = parsePurl(purl)

    const severity = normalizeSeverity(
        props.cvssV3_severity
        ?? (Array.isArray(props.tags) ? props.tags.find((t: any) => typeof t === 'string') : null)
    )

    return {
        id: String(result?.ruleId ?? rule?.id ?? 'unknown'),
        title: String(rule?.shortDescription?.text ?? rule?.name ?? result?.ruleId ?? 'Unknown vulnerability'),
        severity,
        source: String(pkg?.type ?? 'unknown'),
        packageName: pkg?.name ?? null,
        packageType: pkg?.type ?? null,
        installedVersion: pkg?.version ?? null,
        fixedVersion: props.fixed_version ?? null,
        description: result?.message?.text ?? rule?.help?.markdown ?? rule?.help?.text ?? null,
        references: rule?.helpUri ? [String(rule.helpUri)] : [],
        scanners: ['docker_scout'],
    }
}

function parsePurl(purl: string | null): { type: string; name: string; version: string | null } | null {
    if (!purl?.startsWith('pkg:')) return null
    const body = purl.slice(4).split('?')[0]
    const slash = body.indexOf('/')
    if (slash < 0) return null
    const type = body.slice(0, slash)
    const rest = body.slice(slash + 1)
    const at = rest.lastIndexOf('@')
    const namePath = at >= 0 ? rest.slice(0, at) : rest
    const version = at >= 0 ? rest.slice(at + 1) : null
    const name = namePath.split('/').pop() ?? namePath
    return { type, name, version }
}

function normalizeSeverity(v: unknown): SeverityLevel {
    const s = String(v ?? '').toLowerCase()
    const known: string[] = ['critical', 'high', 'medium', 'low']
    return known.includes(s) ? (s as SeverityLevel) : 'unknown'
}

function tally(vulns: VulnerabilityDetail[]): SeverityCount {
    const c = emptySeverity()
    for (const v of vulns) c[v.severity]++
    return c
}

function buildGroups(vulns: VulnerabilityDetail[]): VulnerabilityGroup[] {
    const map = new Map<string, VulnerabilityGroup>()
    for (const v of vulns) {
        if (!map.has(v.source)) map.set(v.source, { source: v.source, total: 0, severity: emptySeverity() })
        const g = map.get(v.source)!
        g.total++
        g.severity[v.severity]++
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
}

function emptySeverity(): SeverityCount {
    return { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
}
