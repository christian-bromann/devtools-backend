import fs from 'fs'
import os from 'os'
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

    return `${req.protocol}://${req.get('host')}${target}`
}

export function readConfig () {
    let config = { data: {} }

    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH))
    } catch (e) {
    }

    return config
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

export function getIpAddress (iface, family = 'ipv4') {
    const interfaces = os.networkInterfaces()

    /**
     * check if interface can be found
     */
    if (!interfaces[iface]) {
        return null
    }

    return interfaces[iface].filter((conn) => conn.family.toLowerCase() === family)[0].address
}
