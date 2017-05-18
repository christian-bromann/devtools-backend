import fs from 'fs'
import ejs from 'ejs'
import path from 'path'
import isOnline from 'is-online'
import bodyParser from 'body-parser'
import serveFavicon from 'serve-favicon'
import request from 'request-promise-native'
import { v4 as uuidV4 } from 'uuid'

import { DEFAULT_PORT } from './'
import logger from './logger'
import { hasGzipEncoding, getFullUrl } from './utils'

const SERVICE_TEMPLATE = fs.readFileSync(path.resolve(__dirname, 'templates', 'service.tpl.html'), 'utf8')
const SOCKET_TEMPLATE = fs.readFileSync(path.resolve(__dirname, 'templates', 'socketio.tpl.html'), 'utf8')
const DEBUGGER_SCRIPT = fs.readFileSync(path.resolve(__dirname, 'scripts', 'debugger.js'), 'utf8')
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
         * initialise external middleware
         */
        this.app.use(bodyParser.urlencoded({ extended: false }))
        this.app.use(bodyParser.json())
        this.app.set('view engine', 'ejs')
        this.app.engine('html', ejs.renderFile)

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
        if (!this.hasInjectedScripts) {
            this.page = this.backend.addPage({
                uuid: this.uuid,
                hostname: `${PROXY_NETWORK_ADDRESS}:${DEFAULT_PORT}`
            })
            this.hasInjectedScripts = true
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
        if (req.originalUrl === '/favicon.ico') {
            return serveFavicon(path.join(__dirname, 'templates', 'favicon.ico'))
        }

        req.target = getFullUrl(req)
        request.head(req.target, (err, res, body) => {
            if (err) {
                this.requestError(err, req.target)
                return proxyRes.status(409).send(err.message || 'Not found')
            }

            /**
             * only proxy resource if content type is an HbbTV application
             * Note: to act as normal proxy (for other apps than hbbtv) it should also allow normal
             * html content-type
             */
            const contentType = res.headers['content-type']
            if (contentType && (contentType.match(/hbbtv/g) || contentType.match(/text\/html;/g))) {
                return next()
            }

            delete req.headers['if-modified-since']
            delete req.headers['if-none-match']
            const opts = {
                url: req.target,
                headers: req.headers,
                method: req.method,
                time: true,
                resolveWithFullResponse: true
            }

            if (req.method.toLowerCase() === 'post' && req.body) {
                opts.json = req.body
            }

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
