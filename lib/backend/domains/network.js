import zlib from 'zlib'
import { hasGzipEncoding } from '../../utils'

/**
 * Returns content served for the given request.
 *
 * @param {Number}  id      socket id
 * @param {Object}  params  parameter object containing requestId
 * @return                  response as base64 encoded
 */
export function getResponseBody ({ id, params }) {
    const request = this.requestList.filter((req) => req.requestId === params.requestId)[0]

    if (!request) {
        return { 'error': `Couldn't find request with id ${params.requestId}` }
    }

    /**
     * if request in not encoded return immediately
     */
    if (!hasGzipEncoding(request.request)) {
        return { body: request.chunks.join('') }
    }

    /**
     * images are not gzipped
     */
    if (request.type.toLowerCase() === 'image') {
        return this.broadcast({
            id,
            result: {
                base64Encoded: true,
                body: Buffer.concat(request.chunks).toString('base64')
            }
        })
    }

    zlib.gunzip(Buffer.concat(request.chunks), (err, body) => {
        if (err) {
            return this.log.error(err)
        }

        if (!body) {
            this.log.error(new Error('Gzip decoding failed'))
            return
        }

        return this.broadcast({
            id,
            result: {
                base64Encoded: false,
                body: body.toString()
            }
        })
    })
}
