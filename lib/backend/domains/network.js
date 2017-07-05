import zlib from 'zlib'
import { hasGzipEncoding } from '../../utils'

export function getResponseBodyData ({ id, params }) {
    const request = this.requestList.filter((req) => req.requestId === params.requestId)[0]

    if (!request) {
        return Promise.reject(
            new Error(`Couldn't find request with id ${params.requestId}`)
        )
    }

    /**
     * if request in not encoded return immediately
     */
    if (!hasGzipEncoding(request.request)) {
        return Promise.resolve({
            id,
            result: {
                base64Encoded: false,
                body: request.chunks.join('')
            }
        })
    }

    /**
     * images are not gzipped
     */
    if (request.type.toLowerCase() === 'image') {
        return Promise.resolve({
            id,
            result: {
                base64Encoded: true,
                body: Buffer.concat(request.chunks).toString('base64')
            }
        })
    }

    return new Promise((resolve, reject) => zlib.gunzip(Buffer.concat(request.chunks), (err, body) => {
        if (err) {
            return reject(err)
        }

        if (!body) {
            const gzipError = new Error('Gzip decoding failed')
            this.log.error(gzipError)
            return reject(gzipError)
        }

        return resolve({
            id,
            result: {
                base64Encoded: false,
                body: body.toString()
            }
        })
    }))
}

/**
 * Returns content served for the given request.
 *
 * @param {Number}  id      socket id
 * @param {Object}  params  parameter object containing requestId
 * @return                  response as base64 encoded
 */
export function getResponseBody (...args) {
    getResponseBodyData.apply(this, args).then(
        (data) => this.send(data),
        (e) => this.log.error(e)
    )
}
