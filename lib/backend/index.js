import url from 'url'

import Page from './page'
import domains from './domains'
import Request from './utils/request'

import logger from '../logger'

/**
 * Debugger Service
 * ================
 *
 * Contains the actual devtools backend logic. It manages devtools pages and analyses network
 * connection if it is run by a proxy.
 */
export default class Backend {
    constructor (io) {
        this.io = io
        this.log = logger('Backend')
        this.requestList = []
        this.pages = []
    }

    upgradeWssSocket (req, socket, head) {
        const pathname = url.parse(req.url).pathname

        for (const page of this.pages) {
            if (pathname === `/devtools/page/${page.uuid}`) {
                return page.wss.handleUpgrade(req, socket, head, ::page.connectWebSocket)
            }
        }

        socket.destroy()
    }

    addPage (params) {
        let page
        const registeredPage = this.pages.find((page) => page.uuid === params.uuid)

        if (!registeredPage) {
            this.log.info(`Create a new page with uuid "${params.uuid}"`)

            page = new Page(
                this.io, params.uuid, params.hostname, params.url, params.title,
                params.description, params.metadata
            )
            this.pages.push(page)

            /**
             * remove page if disconnected from devtools frontend
             */
            page.on('disconnect', ::this.removePage)
            page.on('domainEnabled', (domain) => this.domainEnabled(page, domain))
            page.on('incomming', (params) => this.handleIncomming(page, params))
        } else {
            this.log.info(`Page with uuid "${params.uuid}" already exists`)
            page = registeredPage
        }

        const parsedUrl = url.parse(params.url)
        domains.Page.frameStartedLoading.call(page, {'set-cookie': ['frameId=1.0']}) // emulate page load
        domains.Page.frameNavigated.call(page, 1, `${parsedUrl.protocol}//${parsedUrl.host}`, parsedUrl.path)
    }

    removePage (uuid) {
        this.pages.splice(this.pages.findIndex((page) => page.uuid === uuid), 1)
    }

    domainEnabled (page, domain) {
        /**
         * trigger events in case the dev tool was refreshed
         * (these are normally triggered on page load but in case of
         * a refresh we can emit them here)
         */
        if (domain.toLowerCase() === 'css') {
            page.trigger(domain, { method: 'styleSheetAdded' })
        }

        if (domain.toLowerCase() === 'debugger') {
            page.trigger(domain, { method: 'scriptParsed' })
        }

        if (domain.toLowerCase() === 'runtime') {
            page.trigger(domain, { method: 'executionContextCreated' })

            /**
             * also send target created event as they usually happen at the same time
             */
            domains.Target.targetCreated.call(page)
        }
    }

    handleIncomming (page, {domain, method, msg}) {
        /**
         * check if method has to be executed on serverside
         */
        if (domains[domain] && typeof domains[domain][method] === 'function') {
            let result = domains[domain][method].call(page, msg)

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
        page.trigger(domain, { id: msg.id, method, domain, params: msg.params || {} })
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
}
