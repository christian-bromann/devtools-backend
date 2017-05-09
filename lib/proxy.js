import fs from 'fs'
import ejs from 'ejs'
import path from 'path'
import bodyParser from 'body-parser'
import serveFavicon from 'serve-favicon'
import request from 'request-promise-native'
import { v4 as uuidV4 } from 'uuid'

import logger from './logger'
import { hasGzipEncoding } from './utils'

const SERVICE_TEMPLATE = fs.readFileSync(path.resolve(__dirname, 'templates', 'service.tpl.html'), 'utf8')
const SOCKET_TEMPLATE = fs.readFileSync(path.resolve(__dirname, 'templates', 'socketio.tpl.html'), 'utf8')
const DEBUGGER_SCRIPT = fs.readFileSync(path.resolve(__dirname, 'scripts', 'debugger.js'), 'utf8')
const SOCKETIO_SCRIPT = fs.readFileSync(require.resolve('socket.io-client/dist/socket.io.min.js'), 'utf8')
const INJECT_MARKER = '<!-- inject here -->'

const cookieJar = request.jar()
let frameIds = 0
const subIds = {}

export default class Proxy {
    constructor (app, backend) {
        this.app = app
        this.backend = backend
        this.log = logger('Proxy')
        this.uuid = uuidV4()

        this.page = this.backend.addPage({ uuid: this.uuid })

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
        const target = req.originalUrl // `${req.protocol}://${req.hostname}${req.path}`
        const requestCall = request({
            url: target,
            headers: req.headers,
            resolveWithFullResponse: true,
            time: true,
            /**
             * decompress gzipped requests (excluding assets)
             */
            gzip: hasGzipEncoding(req),
            jar: cookieJar
        })

        this.backend.logRequest(this.page, req, requestCall)

        if (hasGzipEncoding(req)) {
            delete req.headers['accept-encoding']
        }

        /**
         * request HbbTV app
         */
        this.log.info('request HbbTV app at %s', target)
        requestCall.then(
            (res) => this.handleResponse(res, proxyRes, req),
            (e) => this.requestError(e, target)
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
        content = content.replace(injectTag, ejs.render(SOCKET_TEMPLATE, {
            script: SOCKETIO_SCRIPT
        }) + INJECT_MARKER)

        /**
         * inject services
         */
        content = content.replace(INJECT_MARKER, ejs.render(SERVICE_TEMPLATE, {
            uuid: this.uuid,
            name: 'DebuggerService',
            script: DEBUGGER_SCRIPT,
            host: 'http://localhost:9222'
        }))

        proxyRes.set('content-length', content.length)
        proxyRes.send(content)
    }

    requestError (e, target) {
        const message = `request to ${target} failed:\n${e.stack}`
        this.log.error(new Error(message))
    }

    requestIdMiddleware (req, res, next) {
        /**
         * apply requestId to all request where frameId is not set or set new
         * frameId for requests with same request hosts
         */
        if (!req.cookies.frameId || req.cookies.requestIdHost === req.originalUrl) {
            const newFrameId = `${++frameIds}.1`
            const newRequestId = newFrameId + '00'

            req.cookies.frameId = newFrameId
            req.cookies.requestId = newRequestId
            res.cookie('frameId', newFrameId)
            res.cookie('requestId', newRequestId)
            res.cookie('requestIdHost', req.originalUrl)
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

        request.head(req.originalUrl, (err, res, body) => {
            if (err) {
                this.requestError(err, req.originalUrl)
                return proxyRes.status(409).send(err.message || 'Not found')
            }

            /**
             * only proxy resource if content type is an HbbTV application
             */
            const contentType = res.headers['content-type']
            if (contentType && (contentType.match(/hbbtv/) || contentType.includes('text/html'))) {
                return next()
            }

            const requestCall = request({
                url: req.originalUrl,
                headers: req.headers,
                time: true,
                resolveWithFullResponse: true
            })

            this.backend.logRequest(this.page, req, requestCall)
            requestCall.catch((e) => this.requestError(e, req.originalUrl))
            return requestCall.pipe(proxyRes)
        })
    }

    close () {
        this.log.info('stop proxy server')
        this.server.close()
    }
}
