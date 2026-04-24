export default function inferIsError(message: string, raw: string) {
    return /\b(error|exception|failed|panic|fatal|critical|denied|timeout|timed out)\b/i.test(message)
        || /connection refused|authentication failure|failed password|invalid user|permission denied/i.test(message)
        || / \[error\] /i.test(raw)
}
