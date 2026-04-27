import { EventEmitter } from 'events'

class ScoutEmitter extends EventEmitter {}

const scoutEmitter = new ScoutEmitter()

export default scoutEmitter
