import fs from 'fs'
import path from 'path'
import io from 'socket.io'
import ejs from 'ejs'
import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import cors from 'cors'

import logger from './logger'
import Backend from './backend'
import Proxy from './proxy'
import { readConfig, writeConfig, getDomain } from './utils'

export const DEFAULT_HOST = '0.0.0.0'
export const DEFAULT_PORT = 9222

const DEVTOOLS_PATH = path.resolve(__dirname, '..', 'node_modules', 'chrome-devtools-frontend', 'release')
const SCRIPT_PATH = path.resolve(__dirname, 'scripts')
const VIEWS_PATH = path.resolve(__dirname, '..', 'views')
const PAGES_TPL_PATH = path.resolve(VIEWS_PATH, 'pages.tpl.html')

export default class DevtoolsBackend {
    constructor (host = DEFAULT_HOST, port = DEFAULT_PORT) {
        this.host = host
        this.port = port
        this.log = logger()
        this.pages = []

        this.app = express()

        /**
         * check runtime conditions
         */
        this.preflightCheck()

        /**
         * initialise external middleware
         */
        this.app.use(bodyParser.urlencoded({ extended: false }))
        this.app.use(bodyParser.json())
        this.app.set('view engine', 'ejs')
        this.app.set('views', VIEWS_PATH)
        this.app.engine('html', ejs.renderFile)
        this.app.use(cookieParser())

        /**
         * enable cors
         */
        this.app.use(cors())
        this.app.disable('etag')

        /**
         * paths
         */
        this.app.get('/', this.filterRequests(::this.inspectablePages))
        this.app.get('/json', this.filterRequests(::this.json))
        this.app.post('/register', this.filterRequests(::this.register))
        this.app.use('/devtools', this.filterRequests(express.static(DEVTOOLS_PATH)))
        this.app.use('/scripts', this.filterRequests(express.static(SCRIPT_PATH)))

        /**
         * initialise socket server
         */
        this.server = this.app.listen(this.port,
            () => this.log.info(`Started devtools-backend server on ${this.host}:${this.port}`))

        /**
         * initialise socket.io server
         * this connection manages web socket traffic between frontend scripts and devtools-backend
         */
        this.io = io(this.server, { origins: '*:*' })
        this.io.on('connection', (socket) => {
            socket.on('log', (args) => console.log.apply(console, args)) // dev debugging only
            socket.on('error:injectScript', (e) => this.log.error(e))
        })

        /**
         * initialise Websocket Server
         * this connection manages web socket traffic between devtools-frontend and devtools-backend
         */
        this.backend = new Backend(this.io)
        this.server.on('upgrade', ::this.backend.upgradeWssSocket)

        /**
         * init proxy if proxy address was found in environment
         */
        this.proxy = new Proxy(this.app, this.backend)
        this.proxy.preflightCheck()
    }

    /**
     * Backend and Proxy share the same port, make sure we only proxy requests that are not
     * requested on port 9222. These requests are reserved for Backend specific pages
     */
    filterRequests (view) {
        return (req, res, next) => {
            if (!this.proxy || req.get('host').endsWith(`:${DEFAULT_PORT}`)) {
                return view(req, res, next)
            }

            next()
        }
    }

    inspectablePages (req, res, next) {
        return res.sendFile(PAGES_TPL_PATH)
    }

    register (req, res) {
        /**
         * make sure response is not being cached
         */
        res.header('Surrogate-Control', 'no-store')
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.header('Pragma', 'no-cache')
        res.header('Expires', '0')

        this.backend.addPage(req.body)
        return res.json({})
    }

    json (req, res) {
        res.setHeader('Content-Type', 'application/json')
        return res.send(JSON.stringify(this.backend.pages.map((page) => {
            const devtoolsPath = `${page.hostname}/devtools/page/${page.uuid}`
            const title = page.title || getDomain(page.url)
            return {
                description: page.description,
                devtoolsFrontendUrl: `/devtools/inspector.html?ws=${devtoolsPath}`,
                title,
                type: 'page',
                url: page.url.href,
                metadata: page.metadata,
                webSocketDebuggerUrl: `ws://${devtoolsPath}`
            }
        }), null, 2))
    }

    preflightCheck () {
        /**
         * preflight check: devtools-frontend was build
         */
        if (!fs.existsSync(DEVTOOLS_PATH)) {
            throw new Error('Devtools frontend not found. Run `npm run build` to compile.')
        }
    }
}

if (require.main === module) {
    new DevtoolsBackend() // eslint-disable-line no-new
}
