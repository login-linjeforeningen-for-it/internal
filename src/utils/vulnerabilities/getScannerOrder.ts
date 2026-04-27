const scannerOrder: Record<VulnerabilityScanner, number> = {
    docker_scout: 0,
    trivy: 1,
}

export default function getScannerOrder(scanner: VulnerabilityScanner) {
    return scannerOrder[scanner]
}
