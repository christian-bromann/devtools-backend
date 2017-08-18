import fs from 'fs'
import path from 'path'
import npmlog from 'npmlog'
import pkg from '../package.json'

/**
 * levels that are available from `npmlog`
 */
const NPM_LEVELS = ['silly', 'verbose', 'debug', 'info', 'http', 'warn', 'error']

let globalLogFile
let isLogging = Boolean(process.env.LOGGING_PATH)

/**
 * ensure log path exists
 */
if (process.env.LOGGING_PATH && !fs.existsSync(process.env.LOGGING_PATH)) {
    npmlog.info('Logger', `logging path (${process.env.LOGGING_PATH}) doesn't exist`)
    isLogging = false
}

if (isLogging) {
    globalLogFile = fs.createWriteStream(path.resolve(process.env.LOGGING_PATH, `${pkg.name}.log`))
}

npmlog.addLevel('debug', 1000, { fg: 'blue', bg: 'black' }, 'dbug')

export default function Logger (component) {
    let componentLogFile
    const wrappedLogger = {}
    const prefix = pkg.name + (component ? `:${component}` : '')

    /**
     * allow access to the level of the underlying logger
     */
    Object.defineProperty(wrappedLogger, 'level', {
        get: () => { return npmlog.level },
        set: (newValue) => { npmlog.level = newValue },
        enumerable: true,
        configurable: true
    })

    if (isLogging && component) {
        componentLogFile = fs.createWriteStream(
            path.resolve(process.env.LOGGING_PATH, `${pkg.name}_${component}.log`)
        )
    }

    /**
     * add all the levels from `npmlog`, and map to the underlying logger
     */
    for (let level of NPM_LEVELS) {
        wrappedLogger[level] = function (...args) {
            npmlog[level](prefix, ...args)

            if (isLogging) {
                const logArgs = args.map((arg) => typeof arg === 'object' ? JSON.stringify(arg) : arg)
                const logMessage = `${new Date()} ${level.toUpperCase()} ${component ? component + ' ' : ''}${logArgs.join(' ')}\n`
                globalLogFile.write(logMessage)

                if (component) {
                    componentLogFile.write(logMessage)
                }
            }
        }
    }

    if (process.env.NODE_ENV && process.env.NODE_ENV === 'development') {
        wrappedLogger.level = 'verbose'
    }

    wrappedLogger.levels = NPM_LEVELS
    return wrappedLogger
}
