export function hasGzipEncoding (req) {
    return Boolean(
        typeof req.headers['accept-encoding'] === 'string' &&
        req.headers['accept-encoding'].includes('gzip')
    )
}
