import { vulnerabilityScanRuntime } from './runtime.ts'

export default function getDockerScoutScanStatus(): DockerScoutScanStatus {
    return { ...vulnerabilityScanRuntime.scanStatus }
}
