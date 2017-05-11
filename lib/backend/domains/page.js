import zlib from 'zlib'
import { hasGzipEncoding } from '../../utils'

const FRAME_ID_REGEXP = /frameId=(\d+\.\d+)/

/**
 * Fired once navigation of the frame has completed. Frame is now associated with
 * the new loader.
 */
export function frameNavigated (frameId, origin, url) {
    this.send({
        method: 'Page.frameNavigated',
        params: {
            frame: {
                id: frameId,
                loaderId: frameId + '0',
                mimeType: 'text/html',
                securityOrigin: origin,
                url: origin + url
            }
        }
    })
}

/**
 * trigger frameStartedLoading event once hbbtv application was served by proxy
 */
export function frameStartedLoading (headers) {
    let setCookieHeader = headers['set-cookie']
    /**
     * response headers can be a string or string array
     */
    if (Array.isArray(setCookieHeader)) {
        setCookieHeader = setCookieHeader.join('')
    }

    /**
     * return if cookies aren't set
     */
    if (!setCookieHeader || !setCookieHeader.match(FRAME_ID_REGEXP)) {
        return
    }

    const frameId = setCookieHeader.match(FRAME_ID_REGEXP)[1]
    this.send({
        method: 'Page.frameStartedLoading',
        params: { frameId }
    })
}

/**
 * Returns content of the given resource.
 *
 * @param {Number}  id      socket id
 * @param {Object}  params  parameter object containing requestId
 * @return                  response as base64 encoded
 */
export function getResourceContent ({ id, params }) {
    const request = this.requestList.filter((req) => req.fullUrl === params.url)[0]

    if (!request) {
        return { 'error': `Couldn't find request with id ${params.frameId} and url ${params.url}` }
    }

    /**
     * if request in not encoded return immediately
     */
    if (!hasGzipEncoding(request.request)) {
        return { content: request.chunks.join('') }
    }

    /**
     * images are not gzipped
     */
    if (request.type.toLowerCase() === 'image') {
        return this.send({
            id,
            result: {
                base64Encoded: true,
                content: Buffer.concat(request.chunks).toString('base64')
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

        return this.send({
            id,
            result: {
                base64Encoded: false,
                body: body.toString()
            }
        })
    })
}
