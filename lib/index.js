import fs from 'fs'
import path from 'path'
import io from 'socket.io'
import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import cors from 'cors'

import logger from './logger'

const DEFAULT_HOST = '0.0.0.0'
const DEFAULT_PORT = 8080

const DEVTOOLS_PATH = path.resolve(__dirname, '..', 'node_modules', 'chrome-devtools-frontend', 'release')
const SCRIPT_PATH = path.resolve(__dirname, 'scripts')

export default class DevtoolsBackend {
    constructor (host = DEFAULT_HOST, port = DEFAULT_PORT) {
        this.host = host
        this.port = port
        this.log = logger('DevtoolsBackend')

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
        this.app.get('/json', ::this.debuggerJson)
        this.app.post('/register', ::this.registerPage)

        /**
         * initialise socket server
         */
        this.server = this.app.listen(this.port,
            () => this.log.info(`Started devtools-backend server on ${this.port}:${this.port}`))

        this.io = io(this.server)
        this.io.on('connection', (socket) => {
            socket.on('log', (args) => console.log.apply(console, args)) // dev debugging only
            socket.on('error:injectScript', (e) => this.log.error(e))
        })
    }

    registerPage (req, res) {
        /**
         * make sure response is not being cached
         */
        res.header('Surrogate-Control', 'no-store')
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.header('Pragma', 'no-cache')
        res.header('Expires', '0')
    }
}
