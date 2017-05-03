import domains from './domains'
import { setNodeIds } from './utils/dom'
import { getDriverOrigin } from './utils/common'

const SUPPORTED_DOMAINS = Object.keys(domains)
const origin = getDriverOrigin()

/**
 * Pure implementation of the Chrome Remote Debugger Protocol (tip-of-tree) in JavaScript
 */
export default class RemoteDebugger {
    constructor (uuid) {
        this.uuid = uuid
        this.domains = {}
        this.requestId = this.getCookie('requestId') || '1.1' // set to 1.1 in case Network domain is disabled
        this.executionContextId = parseInt(this.requestId.split('.')[0])
        this.frameId = this.getCookie('frameId') || '1.0' // set to 1.0 in case Network domain is disabled
        this.socket = window.io(`${origin}/page/${uuid}`)
        this.emit('connection', {
            status: 'established',
            supportedDomains: SUPPORTED_DOMAINS
        })

        for (let [name, domain] of Object.entries(domains)) {
            this.domains[name] = domain
            this.socket.on(name, (args) => this.dispatchEvent(domain, args))
        }

        /**
         * overwrite console object
         */
        window.console = domains.Runtime.overwriteConsole.call(this, window.console)

        /**
         * assign nodeIds to elements
         */
        setNodeIds(document)
    }

    emit (event, payload) {
        return this.socket.emit(event, payload)
    }

    dispatchEvent (target, args) {
        this.emit('debug', 'received: ' + JSON.stringify(args))

        let result
        const method = target[args.method]

        if (!method) {
            return this.emit('result', {
                id: args.id,
                error: `Method "${args.method}" not found`
            })
        }

        try {
            result = method.call(this, args.params)
        } catch (e) {
            this.emit('debug', { message: e.message, stack: e.stack.slice(0, 1000) })
            return
        }

        if (!result) {
            this.emit('debug', `no result for method "${method.name}"`)
            return
        }

        this.emit('result', {
            id: args.id,
            result,
            _method: args.method,
            _domain: args.domain
        })
    }

    execute (method, params) {
        this.emit('result', { method, params })
    }

    getCookie (n) {
        let a = `; ${document.cookie}`.match(`;\\s*${n}=([^;]+)`)
        return a ? a[1] : ''
    }

    loadHandler (origOnload) {
        this.domains.Runtime.executionContextCreated.call(this)
        this.domains.CSS.styleSheetAdded.call(this)
        this.domains.Debugger.scriptParsed.call(this)
        this.domains.Page.frameStoppedLoading.call(this)
        this.domains.Page.loadEventFired.call(this)
        this.domains.DOM.documentUpdated.call(this)
        origOnload()
    }
}
