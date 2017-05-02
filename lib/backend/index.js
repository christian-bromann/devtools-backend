import domains from './domains'
import Request from './utils/request'
import Page from './models/page'

const SERVER_DOMAINS = ['Network', 'Log']
const FRAME_ID_REGEXP = /frameId=(\d+\.\d+)/

/**
 * Debugger Service
 * ================
 *
 * Contains the actual devtools backend logic. It manages devtools pages and analyses network
 * connection if it is run by a proxy.
 */
export default class DebuggerService {
    constructor (io, uuid) {
        this.io = io
        this.supportedDomains = []
        this.requestList = []
        this.uuid = uuid
        this.pages = []
    }

    addPage (uuid) {
        const page = new Page(uuid, this.io)
        page.enable(SERVER_DOMAINS)

        page.on('domainEnabled', (domain) => {
            /**
             * trigger events in case the dev tool was refreshed
             * (these are normally triggered on page load but in case of
             * a refresh we can emit them here)
             */
            if (domain.toLowerCase() === 'css') {
                page.socket.emit(domain, { method: 'styleSheetAdded' })
            }

            if (domain.toLowerCase() === 'debugger') {
                page.socket.emit(domain, { method: 'scriptParsed' })
            }

            if (domain.toLowerCase() === 'runtime') {
                page.socket.emit(domain, { method: 'executionContextCreated' })

                /**
                 * also send target created event as they usually happen at the same time
                 */
                page.socket.emit('Target', {
                    method: 'targetCreated',
                    params: { uuid: page.uuid }
                })
            }
        })

        page.on('incomming', ({domain, method, msg}) => {
            /**
             * check if method has to be executed on serverside
             */
            if (domains[domain] && typeof domains[domain][method] === 'function') {
                let result = domains[domain][method].call(this, msg)

                /**
                 * some methods are async and broadcast their message on their own
                 */
                if (!result) {
                    return
                }

                return page.send({ id: msg.id, result })
            }

            /**
             * if not handled on server side sent command to device
             */
            page.socket.emit(domain, {
                id: msg.id,
                method,
                domain,
                params: msg.params || {}
            })
        })

        this.pages.push(page)
    }

    /**
     * trigger frameStartedLoading event once hbbtv application was served by proxy
     */
    frameStartedLoading (headers) {
        let setCookieHeader = headers['set-cookie']
        /**
         * response headers can be a string or string array
         */
        if (Array.isArray(setCookieHeader)) {
            setCookieHeader = setCookieHeader.join('')
        }

        /**
         * return if cookies aren't set
         */
        if (!setCookieHeader || !setCookieHeader.match(FRAME_ID_REGEXP)) {
            return
        }

        const frameId = setCookieHeader.match(FRAME_ID_REGEXP)[1]
        this.broadcast({
            method: 'Page.frameStartedLoading',
            params: { frameId }
        })
    }

    logRequest (req, newRequest) {
        const request = new Request(req)

        if (request.fullUrl.includes('samsungcloudsolution')) {
            return
        }

        this.requestList.push(request)

        /**
         * don't do any analytics if network is not enabled
         */
        if (!this.isDomainSupported('Network')) {
            return
        }

        this.log.debug('requestWillBeSent', request.requestId, request.fullUrl)
        this.broadcast({ method: 'Network.requestWillBeSent', params: request.requestWillBeSent() })

        if (req.stale) {
            this.broadcast({ method: 'Network.requestServedFromCache', params: request.requestServedFromCache() })
        }

        newRequest.on('data', (chunk) =>
            this.broadcast({
                method: 'Network.dataReceived',
                params: request.dataReceived(chunk)
            })
        )

        newRequest.then((response) => {
            this.log.debug('loadingFinished', request.requestId, request.fullUrl)

            this.broadcast({
                method: 'Network.responseReceived',
                params: request.responseReceived(response)
            })

            /**
             * send loadingFinished on next tick to make sure responseReceived was sent
             * and got received first
             */
            process.nextTick(() => this.broadcast({
                method: 'Network.loadingFinished',
                params: request.loadingFinished()
            }))
        })

        newRequest.catch((error) => {
            domains.Log.entryAdded.call(this, request, error)

            return this.broadcast({
                method: 'Network.loadingFailed',
                params: request.loadingFailed(error)
            })
        })

        return request
    }

    frameNavigated (req) {
        const origin = `${req.protocol}://${req.headers.host}`
        domains.Page.frameNavigated.call(this, req.cookies.frameId, origin, req.url)
    }

    get isBlocked () {
        // return Boolean(this.ws)
    }
}
