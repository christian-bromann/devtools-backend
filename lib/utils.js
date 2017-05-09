import os from 'os'

export function hasGzipEncoding (req) {
    return Boolean(
        typeof req.headers['accept-encoding'] === 'string' &&
        req.headers['accept-encoding'].includes('gzip')
    )
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
