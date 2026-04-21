export default function sanitize(input: string | undefined) {
    return (input || '').replace(/[^a-zA-Z0-9_.-]/g, '').trim()
}
