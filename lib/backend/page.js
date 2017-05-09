import url from 'url'
import EventEmitter from 'events'

import WebSocket from 'ws'

import domains from './domains'
import middleware from './middleware'
import logger from '../logger'

const SERVER_DOMAINS = ['Network', 'Log', 'Webdriver']

/**
 * Page model
 * ==========
 *
 * Manages connection between: Device (TV) <--> Devtools backend <--> Devtools frontend. Each
 * page can be identified by an UUID where ids between device (TV) and devtools backend might
 * change over time due to page reloads.
 *
 * Device (TV) <--> Devtools backend connection:
 * Handled by a socket.io connection (for compatibility issues)
 *
 * Devtools backend <--> Devtools frontend
 * Handles by a standard socket connection (WS).
 */
export default class Page extends EventEmitter {
    constructor (io, uuid, hostname, url, title, description, metadata) {
        super()
        this.uuid = uuid
        this.hostname = hostname
        this.url = url
        this.title = title
        this.description = description
        this.metadata = metadata
        this.requestList = []

        this.log = logger('Page')
        this.isConnectedToDevtoolsFrontend = false
        this.domains = []
        this.buffer = []

        this.io = io.of(`/page/${this.uuid}`)
        this.io.on('connection', ::this.connect)

        this.wss = new WebSocket.Server({
            perMessageDeflate: false,
            noServer: true
        })
    }

    /**
     * Connect to device (TV)
     */
    connect (socket) {
        this.log.debug(`Connected to device with page id ${this.uuid}`)

        this.socket = socket
        this.socket.on('result', ::this.send)
        this.socket.on('connection', (msg) => {
            this.isConnectedToDevice = true
            this.enable(msg.supportedDomains.concat(SERVER_DOMAINS))
            this.log.info(
                `debugger connection: ${msg.status},\n` +
                `supported domains: ${this.domains.join(',')}`
            )
        })
        this.socket.on('disconnect', ::this.disconnect)
        this.socket.on('debug', (msg) => this.log.debug(msg))
    }

    /**
     * Disconnect from device (TV)
     */
    disconnect () {
        this.log.debug(`Disconnected from page ${this.uuid}`)

        /**
         * clear execution context
         */
        this.send({ method: 'Runtime.executionContextDestroyed', params: { executionContextId: 1 } })
        this.send({ method: 'Runtime.executionContextsCleared', params: {} })

        /**
         * disconnect from devtools frontend if connection was lost for more than 3s
         */
        setTimeout(() => {
            if (this.isConnectedToDevice) {
                // page reconnected (e.g. on page load)
                return
            }

            this.send({ method: 'Inspector.detached', params: { reason: 'Render process gone.' } })
            this.send({ method: 'Inspector.detached', params: { reason: 'target_close' } })
            this.isConnectedToDevice = false
            return this.emit('disconnect', this.uuid)
        }, 3000)
    }

    /**
     * Connect to devtools frontend
     */
    connectWebSocket (ws) {
        this.log.debug(`Connected to devtools-frontend page ${this.uuid}`)

        this.ws = ws
        this.ws.on('message', ::this.handleIncomming)
        this.ws.on('open', () => (this.isConnectedToDevtoolsFrontend = true))
        this.ws.on('close', ::this.disconnectWebSocket)

        /**
         * send events that were missed by devtools-frontend
         */
        this.flushMsgBuffer()
    }

    /**
     * Disconnect from devtools frontend
     */
    disconnectWebSocket () {
        this.isConnectedToDevtoolsFrontend = false
        this.log.debug(`Disconnect from devtools-frontend page ${this.uuid}`)
        delete this.ws
    }

    /**
     * enable domain for page
     *
     * @param {String|String[]} domain  domain(s) to enable
     */
    enable (domain) {
        if (Array.isArray(domain)) {
            return domain.forEach((domain) => this.enable(domain))
        }

        this.emit('domainEnabled', domain)

        if (this.domains.includes(domain)) {
            return this.log.info(`Domain "${domain}" already enabled for page ${this.uuid}`)
        }

        this.log.info(`Enable domain ${domain} for page ${this.uuid}`)
        this.domains.push(domain)
    }

    /**
     * disable domain for page
     */
    disable (domain) {
        this.log.info(`Disable domain ${domain} for page ${this.uuid}`)
        const pos = this.domains.indexOf(domain)
        this.domains.splice(pos, pos + 1)
    }

    /**
     * check if domain is currently supported/enabled
     * Usage:
     *  - isDomainSupported({ method: 'Network.loadingFinished', params: { ... }})
     *  - isDomainSupported('Network')
     *
     * @param   [Object|String] msg  either:
     *                                 - a WS message like first example above or
     *                                 - string if you want to specify the domain directly
     * @returns [Boolean]            true if the specified domain is supported/enabled
     */
    isDomainSupported (msg) {
        if (typeof msg === 'string') {
            return this.domains.includes(msg)
        }

        const method = msg.method || ''
        const splitPoint = method.indexOf('.')
        return this.domains.includes(method.slice(0, splitPoint))
    }

    /**
     * Handle incomming debugger request.
     * Incomming can be either (but mostly) messages from the devtools app directly
     * or from other parts of the app (e.g. proxy)
     *
     * @param {Object|String} payload  message with command and params
     */
    handleIncomming (payload) {
        const msg = typeof payload === 'string' ? JSON.parse(payload) : payload
        const splitPoint = msg.method.indexOf('.')
        const domain = msg.method.slice(0, splitPoint)
        const method = msg.method.slice(splitPoint + 1)

        /**
         * enable domain agent
         */
        if (method === 'enable' && this.isDomainSupported(domain)) {
            this.enable(domain)
            return this.send({ id: msg.id, params: {} })
        }

        /**
         * disable domain agent
         */
        if (method === 'disable') {
            this.disable(domain)
            return this.send({ id: msg.id, params: {} })
        }

        /**
         * don't propagate domains that are not supported or disabled
         */
        if (!this.isDomainSupported(msg)) {
            return
        }

        this.emit('incomming', { method, domain, msg })
    }

    flushMsgBuffer () {
        if (this.ws) {
            this.buffer.forEach((bufferMsg) => this.send(bufferMsg, false))
        }

        this.buffer = []
    }

    /**
     * emits payload to devtools frontend
     * @param  {Object} msg  payload to send
     */
    send (msg, flushBuffer = true) {
        if (!this.ws) {
            this.buffer.push(msg)
            return
        }

        /**
         * check if buffer contains unsend messages
         */
        if (flushBuffer) {
            this.flushMsgBuffer()
        }

        /**
         * check for server side domain handlers
         */
        if (middleware[msg._domain] && middleware[msg._domain][msg._method]) {
            const result = middleware[msg._domain][msg._method].call(this, msg.result, this.requestList)
            return this.send({ id: msg.id, result })
        }

        delete msg._domain
        delete msg._method

        const msgString = JSON.stringify(msg)
        this.log.debug(`Outgoing debugger message: ${msgString.slice(0, 1000)}`)

        /**
         * broadcast to clients that have open socket connection
         */
        if (this.ws.readyState !== WebSocket.OPEN) {
            return
        }

        return this.ws.send(msgString)
    }

    /**
     * trigger event to happen on device
     */
    trigger (domain, params = {}) {
        this.socket.emit(domain, params)
    }

    loaded (targetUrl) {
        if (!targetUrl && !this.url) {
            return
        }

        const parsedUrl = url.parse(targetUrl)
        domains.Page.frameStartedLoading.call(this, {'set-cookie': ['frameId=1.0']}) // emulate page load
        domains.Page.frameNavigated.call(this, 1, `${parsedUrl.protocol}//${parsedUrl.host}`, parsedUrl.path)
        this.url = this.url || targetUrl // update url
    }
}
