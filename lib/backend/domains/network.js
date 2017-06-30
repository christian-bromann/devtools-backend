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
        const notFoundError = new Error(`Couldn't find request with id ${params.requestId}`)
        this.log.error(notFoundError)
        return Promise.reject(notFoundError)
    }

    /**
     * if request in not encoded return immediately
     */
    if (!hasGzipEncoding(request.request)) {
        const result = {
            id,
            result: {
                base64Encoded: false,
                body: request.chunks.join('')
            }
        }
        this.send(result)
        return Promise.resolve(result)
    }

    /**
     * images are not gzipped
     */
    if (request.type.toLowerCase() === 'image') {
        const result = {
            id,
            result: {
                base64Encoded: true,
                body: Buffer.concat(request.chunks).toString('base64')
            }
        }
        this.send(result)
        return Promise.resolve(result)
    }

    return new Promise((resolve, reject) => zlib.gunzip(Buffer.concat(request.chunks), (err, body) => {
        if (err) {
            this.log.error(err)
            return reject(err)
        }

        if (!body) {
            const gzipError = new Error('Gzip decoding failed')
            this.log.error(gzipError)
            return reject(gzipError)
        }

        const result = {
            id,
            result: {
                base64Encoded: false,
                body: body.toString()
            }
        }
        this.send(result)
        return resolve(result)
    }))
}
