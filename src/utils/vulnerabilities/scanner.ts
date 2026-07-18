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
            scannerResults: [{
                scanner: 'docker_scout', scannedAt,
                totalVulnerabilities: vulnerabilities.length, severity,
                scanError: null, summaryOnly: false, note: null,
            }],
            scanError: null,
        }
    } catch (err: unknown) {
        const scanError = err instanceof Error ? err.message : String(err)
        const severity = emptySeverity()
        return {
            image,
            scannedAt,
            totalVulnerabilities: 0,
            severity,
            groups: [],
            vulnerabilities: [],
            scannerResults: [{
                scanner: 'docker_scout', scannedAt,
                totalVulnerabilities: 0, severity,
                scanError, summaryOnly: false, note: null,
            }],
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

    type O = Record<string, unknown>
    const sarif = JSON.parse(trimmed.slice(start)) as O
    const runs: O[] = Array.isArray(sarif?.runs) ? sarif.runs as O[] : []

    const details = runs.flatMap(run => {
        const rules = new Map<string, O>(
            ((run?.tool as O)?.driver as O)?.rules
                ? (((run?.tool as O)?.driver as O)?.rules as O[]).map((r: O) => [r.id as string, r])
                : []
        )
        return ((run?.results ?? []) as O[]).map((result: O) => toDetail(result, rules.get(result?.ruleId as string)))
    }).filter(Boolean) as VulnerabilityDetail[]

    const SEVERITY_ORDER: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'unknown']
    return details.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
}

function toDetail(result: Record<string, unknown>, rule: Record<string, unknown> | undefined): VulnerabilityDetail | null {
    if (!result && !rule) return null

    type O = Record<string, unknown>
    const props = (rule?.properties as O) ?? {}
    const purl: string | null = Array.isArray(props.purls) ? (props.purls as unknown[])[0] as string ?? null : null
    const pkg = parsePurl(purl)

    const severity = normalizeSeverity(
        props.cvssV3_severity
        ?? (Array.isArray(props.tags) ? (props.tags as unknown[]).find((t) => typeof t === 'string') : null)
    )

    return {
        id: String(result?.ruleId ?? rule?.id ?? 'unknown'),
        title: String((rule?.shortDescription as O)?.text ?? rule?.name ?? result?.ruleId ?? 'Unknown vulnerability'),
        severity,
        source: String(pkg?.type ?? 'unknown'),
        packageName: pkg?.name ?? null,
        packageType: pkg?.type ?? null,
        installedVersion: pkg?.version ?? null,
        fixedVersion: props.fixed_version as string ?? null,
        description: (result?.message as O)?.text as string
            ?? (rule?.help as O)?.markdown as string
            ?? (rule?.help as O)?.text as string
            ?? null,
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
