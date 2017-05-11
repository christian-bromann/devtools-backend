import fs from 'fs'
import path from 'path'
import io from 'socket.io'
import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import cors from 'cors'

import logger from './logger'
import Backend from './backend'
import Proxy from './proxy'

export const DEFAULT_HOST = '0.0.0.0'
export const DEFAULT_PORT = 9222

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
         * check runtime conditions
         */
        this.preflightCheck()

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
        if (process.env.PROXY_ADDRESS) {
            this.proxy = new Proxy(this.app, this.backend)
            this.proxy.preflightCheck()
        } else {
            this.log.info('Couldn\'t find "PROXY_ADDRESS" in environment, proxy not started')
        }
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
        return res.json(this.backend.pages.map((page) => {
            const devtoolsPath = `${page.hostname}/devtools/page/${page.uuid}`
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

    preflightCheck () {
        /**
         * preflight check: devtools-frontend was build
         */
        if (!fs.existsSync(DEVTOOLS_PATH)) {
            throw new Error('Devtools frontend not found. Run `npm run build` to compile.')
        }

        /**
         * preflight check: required node version
         */
        const requiredNodeVersion = fs.readFileSync(path.resolve(__dirname, '..', '.nvmrc'), 'utf8').trim()
        if (process.version !== requiredNodeVersion) {
            throw new Error(`Node.JS version missmatch, expected ${requiredNodeVersion} but found ${process.version}`)
        }
    }
}

if (require.main === module) {
    new DevtoolsBackend() // eslint-disable-line no-new
}
