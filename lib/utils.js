import fs from 'fs'
import path from 'path'

const CONFIG_FILE_PATH = path.resolve(__dirname, '..', 'config.json')

export function hasGzipEncoding (req) {
    return Boolean(
        typeof req.headers['accept-encoding'] === 'string' &&
        req.headers['accept-encoding'].includes('gzip')
    )
}

export function getFullUrl (req) {
    let target = req.originalUrl
    if (target.startsWith('/')) {
        target = `${req.protocol}://${req.hostname}${target}`
    }

    return target
}

export function readConfig () {
    let config = { data: {} }

    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH))
    } catch (e) {
    }

    return config
}

export function writeConfig (data) {
    const newConfig = { data }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(newConfig), 'utf8')
}
