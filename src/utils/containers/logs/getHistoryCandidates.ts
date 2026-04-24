import { homedir } from 'os'
import { join } from 'path'

export default function getHistoryCandidates() {
    const home = homedir()
    return [
        join(home, '.zsh_history'),
        join(home, '.bash_history'),
        '/root/.bash_history',
        '/root/.zsh_history',
    ]
}
