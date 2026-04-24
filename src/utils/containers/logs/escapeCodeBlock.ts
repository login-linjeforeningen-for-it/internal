export default function escapeCodeBlock(value: string) {
    return value.replace(/```/g, '``\\`')
}
