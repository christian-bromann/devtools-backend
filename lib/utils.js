import fs from 'fs'
import path from 'path'

const CONFIG_FILE_PATH = path.resolve(__dirname, '..', 'config.json')

export function hasGzipEncoding (req) {
    return Boolean(
        typeof req.headers['accept-encoding'] === 'string' &&
        req.headers['accept-encoding'].includes('gzip')
    )
}

export function getDomain (url) {
    return url.host.split('.').slice(-2).join('.')
}

export function getFullUrl (req, page) {
    let target = req.originalUrl

    if (!target.startsWith('/')) {
        return target
    }

    return `${req.protocol}://${req.hostname}${target}`
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

export function getRequestOpts (req) {
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

    return opts
}
