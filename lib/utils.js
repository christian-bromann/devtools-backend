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
