import fs from 'fs'
import ejs from 'ejs'
import path from 'path'
import isOnline from 'is-online'
import serveFavicon from 'serve-favicon'
import request from 'request-promise-native'
import { v4 as uuidV4 } from 'uuid'

import { DEFAULT_PORT } from './'
import logger from './logger'
import { hasGzipEncoding, getFullUrl, readConfig, getRequestOpts } from './utils'

const SERVICE_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '..', 'views', 'service.tpl.html'), 'utf8')
const SOCKET_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '..', 'views', 'socketio.tpl.html'), 'utf8')
const DEBUGGER_SCRIPT = fs.readFileSync(path.resolve(__dirname, 'scripts', 'debugger.js'), 'utf8')
const APP_MAN_TAG = `<object
    style="width:0;height:0;position: absolute;"
    id="debuggerAppMan"
    data-origin="debugger"
    type="application/oipfApplicationManager">
</object>`
const INJECT_MARKER = '<!-- inject here -->'

export const PROXY_ADDRESS = process.env.PROXY_ADDRESS || '192.168.0.1'
export const PROXY_NETWORK_ADDRESS = process.env.PROXY_NETWORK_ADDRESS || (
    fs.existsSync('/etc/hostname')
        ? fs.readFileSync('/etc/hostname', 'utf8').trim() + '.local'
        : 'localhost'
)

const cookieJar = request.jar()
let frameIds = 0
const subIds = {}

export default class Proxy {
    constructor (app, backend) {
        this.log = logger('Proxy')
        this.log.info(`Start proxy server on ${PROXY_ADDRESS}`)
        this.app = app
        this.backend = backend
        this.uuid = uuidV4()

        /**
         * route all packages through server
         */
        this.app.use(::this.requestIdMiddleware)
        this.app.use(::this.proxyFilter)
        this.app.get('*', ::this.proxy)
    }

    proxy (req, proxyRes) {
        delete req.headers['if-modified-since']
        delete req.headers['if-none-match']

        /**
         * check autoload settings
         */
        const { autoload, whitelist } = readConfig().data
        const cues = typeof whitelist === 'string' ? whitelist.split(',').map((f) => f.trim()) : []
        if (autoload && !cues.find(cue => req.get('host').indexOf(cue) > -1)) {
            this.log.info(`Autoload URL found, redirecting to ${autoload}`)
            return proxyRes.redirect(307, autoload)
        }

        const requestCall = request({
            url: req.target,
            headers: req.headers,
            resolveWithFullResponse: true,
            time: true,
            /**
             * decompress gzipped requests (excluding assets)
             */
            gzip: hasGzipEncoding(req),
            jar: cookieJar
        })

        if (this.page) {
            this.page.frameNavigated(req.target, req.cookies.frameId)
            this.backend.logRequest(this.page, req, requestCall)
            this.page.frameStartedLoading(req.target, req.cookies.frameId)
        }

        if (hasGzipEncoding(req)) {
            delete req.headers['accept-encoding']
        }

        /**
         * request HbbTV app
         */
        this.log.info('request HbbTV app at %s', req.target)
        requestCall.then(
            (res) => this.handleResponse(res, proxyRes, req),
            (e) => this.requestError(e, req.target)
        )
    }

    handleResponse (res, proxyRes, req) {
        let content = res.body

        /**
         * propagate headers
         */
        for (let [key, value] of Object.entries(res.headers)) {
            /**
             * all requested files get decompressed therefor ignore content encoding
             */
            if (key === 'content-encoding' && value === 'gzip') {
                continue
            }
            proxyRes.set(key, value)
        }

        this.log.debug(`inject frontend scripts on ${res.request.uri.href}`)
        const injectTag = content.includes('<head>') ? '<head>' : '</title>'

        /**
         * inject socket.io script before everything else
         */
        content = content.replace(injectTag, injectTag + ejs.render(SOCKET_TEMPLATE, {
            uuid: this.uuid,
            proxyAddress: PROXY_ADDRESS,
            proxyPort: DEFAULT_PORT
        }) + INJECT_MARKER)

        /**
         * inject services
         */
        content = content.replace(INJECT_MARKER, ejs.render(SERVICE_TEMPLATE, {
            uuid: this.uuid,
            name: 'DebuggerService',
            script: DEBUGGER_SCRIPT,
            proxyAddress: PROXY_ADDRESS,
            proxyPort: DEFAULT_PORT
        }))

        /**
         * create page if scripts get initially injected
         */
        if (!this.page) {
            this.page = this.backend.addPage({
                uuid: this.uuid,
                hostname: `${PROXY_NETWORK_ADDRESS}:${DEFAULT_PORT}`,
                url: res.request.uri.href
            })
        }

        /**
         * make non hbbtv apps viewable
         */
        if (!res.headers['content-type'].includes('hbbtv')) {
            content = content.replace('</body>', APP_MAN_TAG + '</body>')
        }

        proxyRes.set('content-length', content.length)
        proxyRes.send(content)
    }

    requestError (e, target) {
        const message = `request to ${target} failed:\n${e.stack}`
        this.log.error(new Error(message))
    }

    requestIdMiddleware (req, res, next) {
        const target = getFullUrl(req)

        /**
         * skip middleware for internal device requests
         */
        if (!req.headers['user-agent']) {
            return next()
        }

        /**
         * apply requestId to all request where frameId is not set or set new
         * frameId for requests with same request hosts
         */
        if (!req.cookies.frameId || req.cookies.requestIdHost === target) {
            const newFrameId = `${++frameIds}.1`
            const newRequestId = newFrameId + '00'

            req.cookies.frameId = newFrameId
            req.cookies.requestId = newRequestId
            res.cookie('frameId', newFrameId)
            res.cookie('requestId', newRequestId)
            res.cookie('requestIdHost', target)
            return next()
        }

        const frameId = req.cookies.frameId.split('.')[0]

        if (!subIds[frameId]) {
            subIds[frameId] = 1
        }

        const subId = ++subIds[frameId]
        const requestId = `${frameId}.${subId}`
        res.cookie('frameId', req.cookies.frameId)
        res.cookie('requestId', requestId)
        req.cookies.requestId = requestId
        next()
    }

    /**
     * Sends a head request first to check if requested source is an HbbTV application.
     * If source is an HbbTV file forward to the proxy handler otherwise pipe response
     * directly to the proxy.
     */
    proxyFilter (req, proxyRes, next) {
        req.target = getFullUrl(req)

        if (req.originalUrl === '/favicon.ico') {
            return serveFavicon(path.join(__dirname, '..', 'views', 'favicon.ico'))
        }

        /**
         * ignore all requests not comming from the HbbTV browser
         * e.g. Netflix or internal manufacture requests
         */
        if (!req.headers['user-agent'] || !req.headers['user-agent'].match(/HbbTV/i)) {
            const opts = getRequestOpts(req)

            if (req.method === 'POST') {
                opts.headers['content-length'] = JSON.stringify(req.body).length
            }

            const requestCall = request(opts)
            requestCall.catch((err) => this.log.error('Internal request failed', req.target, err.message))
            return requestCall.pipe(proxyRes)
        }

        request.head(req.target).then((headers) => {
            /**
             * only proxy resource if content type is an HbbTV application
             * Note: to act as normal proxy (for other apps than hbbtv) it should also allow normal
             * html content-type
             */
            const contentType = headers['content-type']
            if (contentType &&
                contentType.match(/(hbbtv|text\/html)/g) &&
                /**
                 * Don't register any new pages when the current page was loaded less than 500ms ago.
                 * This way we avoid iFrames (such as Facebook widgets) to take over prority
                 */
                (!this.page || !this.page.connectionDuration || this.page.connectionDuration > 1000)
            ) {
                return next()
            }

            const opts = getRequestOpts(req)
            const requestCall = request(opts)

            /**
             * only log request if from browser
             */
            if (req.headers['user-agent'] && req.method.toLowerCase() === 'get') {
                if (this.page) {
                    this.backend.logRequest(this.page, req, requestCall)
                }
                requestCall.catch((e) => this.requestError(e, req.target))
            } else {
                requestCall.catch(() => {})
            }

            return requestCall.pipe(proxyRes)
        }, (err) => {
            /**
             * in case the server changes the host within its headers after the page was
             * served (e.g. like for the RTL2 HbbTV app) and assets with src path starting
             * with "/..." fail try to use original host
             */
            if (!req.retry && this.page) {
                req.originalUrl = `${this.page.url.protocol}//${this.page.url.host}${req.originalUrl}`
                req.headers.host = this.page.url.host
                req.retry = true
                return this.proxyFilter(req, proxyRes, next)
            }

            this.log.error('Head request failed', req.target, err.message)
            return proxyRes.status(409).send(err.message || 'Not found')
        })
    }

    async preflightCheck () {
        this.log.info('Starting preflight checks ...')

        /**
         * check internet connectivity
         */
        if (!await isOnline()) {
            throw new Error('Couldn\'t connect to the internet. Proxy requires an internet connection to work.')
        }

        this.log.info('Preflight check successful')
    }
}
