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
                this.io, params.uuid, params.hostname, url.parse(params.url), params.title,
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

        /**
         * clear css cache
         */
        page.cssContent = []

        page.frameStartedLoading()
        return page
    }

    removePage (uuid) {
        const deletedPages = this.pages.splice(this.pages.findIndex((page) => page.uuid === uuid), 1)

        /**
         * clear page so that listeners get removed
         */
        for (let i = 0; i < deletedPages.length; ++i) {
            delete deletedPages[i]
        }
    }

    domainEnabled (page, domain) {
        /**
         * trigger events in case the dev tool was refreshed
         * (these are normally triggered on page load but in case of
         * a refresh we can emit them here)
         */
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

        /**
         * send over css content to register stylesheets
         */
        if (domain.toLowerCase() === 'css') {
            page.cssContent
                .filter((content) => content.params.frameId === page.frameId)
                .forEach((content) => page.trigger('CSS', content))
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

    logRequest (page, req, newRequest) {
        const request = new Request(req)

        if (request.fullUrl.includes('samsungcloudsolution')) {
            return
        }

        page.requestList.push(request)

        /**
         * don't do any analytics if network is not enabled
         */
        if (!page.isDomainSupported('Network')) {
            return
        }

        this.log.debug('requestWillBeSent', request.requestId, request.fullUrl)
        page.send({ method: 'Network.requestWillBeSent', params: request.requestWillBeSent() })

        if (req.stale) {
            page.send({ method: 'Network.requestServedFromCache', params: request.requestServedFromCache() })
        }

        newRequest.on('data', (chunk) =>
            page.send({
                method: 'Network.dataReceived',
                params: request.dataReceived(chunk)
            })
        )

        newRequest.then((response) => {
            this.log.debug('loadingFinished', request.requestId, request.fullUrl)

            page.send({
                method: 'Network.responseReceived',
                params: request.responseReceived(response)
            })

            if (request.type === 'Stylesheet') {
                domains.Network.getResponseBodyData.call(page, {
                    params: { requestId: request.requestId }
                }).then((result) => {
                    const hasRegisteredStyle = Boolean(
                        page.cssContent.find(({ params }) => params.url === request.req.url)
                    )
                    const payload = {
                        method: 'styleSheetRegistered',
                        params: {
                            url: request.req.url,
                            cssText: result.result.body,
                            frameId: request.frameId
                        }
                    }

                    if (!hasRegisteredStyle) {
                        page.cssContent.push(payload)
                    }

                    /**
                     * only trigger stylesheet registration if CSS domain was
                     * already enabled
                     */
                    if (page.domains.includes('CSS') && !hasRegisteredStyle) {
                        return page.trigger('CSS', payload)
                    }
                })
            }

            /**
             * send loadingFinished on next tick to make sure responseReceived was sent
             * and got received first
             */
            process.nextTick(() => page.send({
                method: 'Network.loadingFinished',
                params: request.loadingFinished()
            }))
        })

        newRequest.catch((error) => {
            domains.Log.entryAdded.call(page, request, error)

            return page.send({
                method: 'Network.loadingFailed',
                params: request.loadingFailed(error)
            })
        })

        return request
    }
}
