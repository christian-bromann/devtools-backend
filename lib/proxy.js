import fs from 'fs'
import io from 'socket.io'
import ejs from 'ejs'
import path from 'path'
import isOnline from 'is-online'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import request from 'request-promise-native'
import { v4 as uuidV4 } from 'uuid'

import logger from './logger'
import { DebuggerService, WebdriverService } from './services'
import { WEBSOCKET_PORT } from './services/debugger'
import {
    hasGzipEncoding, getIpAddress, readConfig, writeConfig, getDescription, getDeviceConfig,
    isAlreadyRegistered
} from './utils'

const SERVICE_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '..', 'static', 'service.tpl.html'), 'utf8')
const INJECT_MARKER = '<!-- inject here -->'

const cookieJar = request.jar()
let frameIds = 0
const subIds = {}

export default class Proxy {
    constructor () {
        this.log = logger('Proxy')
        this.uuid = uuidV4()
        this.pageInfo = {}
        this.tvIPAddress = getIpAddress('eth1')

        /**
         * initialise external middleware
         */
        this.app.use(bodyParser.urlencoded({ extended: false }))
        this.app.use(bodyParser.json())
        this.app.use(cookieParser())
        this.app.set('view engine', 'ejs')
        this.app.engine('html', ejs.renderFile)

        /**
         * proxy routes
         */
        this.app.get('/favicon.ico', ::this.serveFavicon)
        this.app.get('/json', ::this.debuggerJson)

        /**
         * route all packages through server
         */
        this.app.use(::this.requestIdMiddleware)
        this.app.use(::this.proxyFilter)
        this.app.get('*', ::this.proxy)
    }

    /**
     * starts proxy server and its socket connections
     */
    async run () {
        /**
         * make sure all conditions are met to run proxy
         */
        await this.preflightCheck()

        /**
         * initialise socket server
         */
        this.server = this.app.listen(this.port,
            () => this.log.info(`Started proxy server on port ${this.port}`))

        this.io = io(this.server)
        this.io.on('connection', (socket) => {
            socket.on('log', (args) => console.log.apply(console, args))
            socket.on('error:injectScript', (e) => this.log.error(e))

            if (!this.hasInjectedScript) {
                this.webdriver.reloadOnConnect = true
            }
        })

        /**
         * initialise services
         */
        this.webdriver = new WebdriverService(this.io)
        this.remoteDebuggerBackend = new DebuggerService(this.io, this.uuid)
    }

    proxy (req, proxyRes) {
        const target = `${req.protocol}://${req.hostname}${req.url}`
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

        this.remoteDebuggerBackend.frameStartedLoading(proxyRes._headers)
        this.remoteDebuggerBackend.frameNavigated(req)
        this.remoteDebuggerBackend.logRequest(req, requestCall)

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

        /**
         * inject socket.io script before everything else
         */
        content = content.replace('<head>', `<head>
            <script src="http://${this.tvIPAddress}:8080/socket.io/socket.io.js" data-origin="debugger"></script>
            <script type="text/javascript" data-origin="debugger">
                //<![CDATA[
                window.socket = window.io();
                /**
                 * convinience method to log data in Appium
                 */
                window.log = function () {
                    var args = Array.prototype.slice.call(arguments);
                    window.socket.emit('log', args);
                }
                /**
                 * register onError handler to propagate page errors back to proxy server
                 * https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers/onerror
                 */
                window.onerror = function (errorMsg, url, lineNumber) {
                    window.socket.emit('error:window', {
                       errorMsg: errorMsg,
                       url: url,
                       lineNumber: lineNumber
                    });
                };
                //]]>
            </script>
            ${INJECT_MARKER}
        `)

        /**
         * inject services at the end of the file
         */
        // content = content.replace(INJECT_MARKER, ejs.render(SERVICE_TEMPLATE, {
        //     name: WebdriverService.name,
        //     script: this.webdriver.getScript()
        // }) + INJECT_MARKER)
        content = content.replace(INJECT_MARKER, ejs.render(SERVICE_TEMPLATE, {
            uuid: this.uuid,
            name: DebuggerService.name,
            script: this.remoteDebuggerBackend.getScript()
        }))

        const url = `${req.protocol}://${req.hostname}`
        const titleMatch = content.match(/<title>(.*)<\/title>/)
        this.pageInfo = {
            favicon: `${url}/favicon.ico`,
            url,
            title: titleMatch ? titleMatch[1] : undefined,
            description: getDescription(content)
        }

        this.hasInjectedScript = true
        proxyRes.set('content-length', content.length)
        proxyRes.send(content)
    }

    debuggerJson (req, res) {
        const devtoolsPath = `${this.host}:${WEBSOCKET_PORT}/devtools/page/${this.uuid}`
        return res.json({
            description: this.pageInfo.description,
            devtoolsFrontendUrl: `/devtools/inspector.html?ws=${devtoolsPath}`,
            devtoolsUrl: `http://${this.host}:${this.port}/inspector.html`,
            title: this.pageInfo.title,
            type: 'page',
            url: this.pageInfo.url,
            webSocketDebuggerUrl: `ws://${devtoolsPath}`
        })
    }

    async getNodeConfig (req, res) {
        let deviceConfig

        try {
            deviceConfig = await getDeviceConfig()
        } catch (e) {
            return res.status(403).json({
                message: 'Device not found or could not be detected',
                error: e.message
            })
        }

        return res.json(deviceConfig)
    }

    requestError (e, target) {
        const message = `request to ${target} failed:\n${e.stack}`
        this.log.error(new Error(message))
    }

    requestIdMiddleware (req, res, next) {
        const target = `${req.protocol}://${req.hostname}${req.url}`

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
        const target = `${req.protocol}://${req.hostname}${req.url}`
        request.head(target, (err, res, body) => {
            if (err) {
                this.requestError(err, target)
                return proxyRes.status(409).send(err.message || 'Not found')
            }

            /**
             * only proxy resource if content type is an HbbTV application
             */
            if (res.headers['content-type'] && res.headers['content-type'].match(/hbbtv/)) {
                return next()
            }

            const requestCall = request({
                url: target,
                headers: req.headers,
                time: true,
                resolveWithFullResponse: true
            })

            this.remoteDebuggerBackend.logRequest(req, requestCall)
            requestCall.catch((e) => this.requestError(e, target))
            return requestCall.pipe(proxyRes)
        })
    }

    serveFavicon (req, res) {
        /**
         * send own icon if no HbbTV was loaded so far
         */
        if (!this.pageInfo.favicon) {
            return res.sendFile(path.resolve(__dirname, '..', 'static', 'favicon.png'))
        }

        /**
         * redirect to icon of loaded HbbTV app
         */
        res.redirect(302, this.pageInfo.favicon)
    }

    async getSettings (req, res) {
        let proxyConfig = readConfig()
        const { host, port } = proxyConfig.data

        if (host && port) {
            proxyConfig.data.isAlreadyRegistered = await isAlreadyRegistered(host, port, this.uuid)
        }

        res.render('settings.html', proxyConfig)
    }

    async postSettings (req, res) {
        const { host, port } = req.body
        this.log.info('Write config to file:', req.body)
        writeConfig(req.body)

        /**
         * register node if settings were given
         */
        if (host && port && await isAlreadyRegistered(host, port, this.uuid)) {
            return await this.registerNode(req.body, res)
        }

        return res.redirect('/settings')
    }

    async registerNode (body, res) {
        const { host, port } = body
        let deviceConfig

        try {
            deviceConfig = await getDeviceConfig()
            deviceConfig.configuration.id = this.uuid
        } catch (e) {
            return res.status(403).json({
                message: 'Device not found or could not be detected',
                error: e.message
            })
        }

        try {
            this.log.info('Trying to register to grid with config', deviceConfig)
            request({
                url: `http://${host}:${port}/grid/register`,
                method: 'POST',
                body: deviceConfig,
                json: true,
                resolveWithFullResponse: true
            })
        } catch (e) {
            return res.status(403).send('Could not register to hub: ' + e.message)
        }

        this.log.info(`Successfully registered to Selenium hub at ${host}:${port}`)
        return res.redirect('/settings')
    }

    getInspector (req, res) {
        if (this.remoteDebuggerBackend.isBlocked) {
            return res.status(409).send('The debugger is already used by someone else')
        }

        return res.render('inspector.html', {
            uuid: this.uuid,
            host: this.host
        })
    }

    /**
     * makes sure the proxy is ready to start
     */
    async preflightCheck () {
        this.log.info('doing preflight checks...')

        /**
         * make sure connection to TV was established
         * only log warning as we don't require a connection when using a launcher
         */
        if (!this.tvIPAddress) {
            this.log.error('Couldn\'t find a connection to TV. Please check network settings.')
        }

        /**
         * check internet connectivity
         */
        if (!await isOnline()) {
            throw new Error('Couldn\'t connect to the internet')
        }

        this.log.info('preflight checks fine, no severe issues')
    }

    close () {
        this.log.info('stop proxy server')
        this.server.close()
    }
}
