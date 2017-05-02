import fs from 'fs'
import url from 'url'
import path from 'path'
import io from 'socket.io'
import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import cors from 'cors'

import logger from './logger'
import DebuggerService from './backend'
import Page from './backend/page'

const DEFAULT_HOST = '0.0.0.0'
const DEFAULT_PORT = 9222

const DEVTOOLS_PATH = path.resolve(__dirname, '..', 'node_modules', 'chrome-devtools-frontend', 'release')
const SCRIPT_PATH = path.resolve(__dirname, 'scripts')

export default class DevtoolsBackend {
    constructor (host = DEFAULT_HOST, port = DEFAULT_PORT) {
        this.host = host
        this.port = port
        this.log = logger('DevtoolsBackend')
        this.pages = []

        this.app = express()

        /**
         * preflight check: devtools-frontend was build
         */
        if (!fs.existsSync(DEVTOOLS_PATH)) {
            throw new Error('Devtools frontend not found. Run `npm run build` to compile.')
        }

        /**
         * middlewares
         */
        this.app.use('/devtools', express.static(DEVTOOLS_PATH))
        this.app.use('/scripts', express.static(SCRIPT_PATH))
        this.app.use(bodyParser.urlencoded({ extended: false }))
        this.app.use(bodyParser.json())
        this.app.use(cookieParser())

        /**
         * enable cors
         */
        this.app.use(cors())
        this.app.disable('etag')

        /**
         * paths
         */
        this.app.get('/json', ::this.json)
        this.app.post('/register', ::this.register)

        /**
         * initialise socket server
         */
        this.server = this.app.listen(this.port,
            () => this.log.info(`Started devtools-backend server on ${this.host}:${this.port}`))

        /**
         * initialise socket.io server
         * this connection manages web socket traffic between frontend scripts and devtools-backend
         */
        this.io = io(this.server)
        this.io.on('connection', (socket) => {
            socket.on('log', (args) => console.log.apply(console, args)) // dev debugging only
            socket.on('error:injectScript', (e) => this.log.error(e))
        })

        /**
         * initialise Websocket Server
         * this connection manages web socket traffic between devtools-frontend and devtools-backend
         */
        this.server.on('upgrade', (req, socket, head) => {
            const pathname = url.parse(req.url).pathname

            for (const page of this.pages) {
                if (pathname === `/devtools/page/${page.uuid}`) {
                    return page.wss.handleUpgrade(req, socket, head, ::page.connectWebSocket)
                }
            }

            socket.destroy()
        })
    }

    register (req, res) {
        /**
         * make sure response is not being cached
         */
        res.header('Surrogate-Control', 'no-store')
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.header('Pragma', 'no-cache')
        res.header('Expires', '0')

        const { uuid, url, title, description, metadata } = req.body
        const registeredPage = this.pages.find((page) => page.uuid === uuid)
        if (uuid && registeredPage) {
            this.log.info(`page with uuid "${uuid}" already exists`)
            return res.json({
                host: this.host,
                port: this.port,
                uuid: uuid
            })
        }

        const page = new Page(this.io, uuid, url, title, description, metadata)
        this.backend = new DebuggerService(page)
        this.pages.push(page)
        return res.json({
            host: this.host,
            port: this.port,
            uuid: page.uuid
        })
    }

    json (req, res) {
        return res.json(this.pages.map((page) => {
            const devtoolsPath = `${this.host}:${this.port}/devtools/page/${page.uuid}`
            return {
                description: page.description,
                devtoolsFrontendUrl: `/devtools/inspector.html?ws=${devtoolsPath}`,
                title: page.title,
                type: 'page',
                url: page.url,
                metadata: page.metadata,
                webSocketDebuggerUrl: `ws://${devtoolsPath}`
            }
        }))
    }
}

if (require.main === module) {
    new DevtoolsBackend() // eslint-disable-line no-new
}
