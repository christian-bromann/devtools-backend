import path from 'path'
import mime from 'mime-types'
import mimeDB from 'mime-db'
import logger from '../../logger'

export default class Request {
    constructor (req) {
        this.req = req
        this.log = logger('Request')

        this.origin = `${req.protocol}://${req.headers.host}`
        this.fullUrl = this.origin + req.url
        this.documentURL = req.cookies.requestIdHost || this.fullUrl
        this.requestId = req.cookies.requestId
        this.frameId = req.cookies.frameId
        this.loaderId = req.cookies.frameId + '0'
        this.request = {
            headers: req.headers,
            /**
             * initial page request have VeryHigh initial priority
             */
            initialPriority: this.requestId.slice(-2) === '.100' ? 'VeryHigh' : 'Medium',
            method: req.method,
            mixedContentType: 'none',
            postData: JSON.stringify(req.body),
            url: this.fullUrl
        }
        this.wallTime = (new Date()).getTime() / 1000
        this.requestBodySize = 0
        this.mimeType = this.getMimeType(req)
        this.chunks = []
        this.responseHeaders = {
            'content-type': ''
        }
    }

    getMimeType (req) {
        const mimeLookup = mime.lookup(req.url)

        if (mimeLookup) {
            return mimeLookup
        }

        if (typeof req.headers.accept === 'string') {
            const acceptedMimeTypes = req.headers.accept
                .split(',')
                .filter((mimeType) => Boolean(mimeDB[mimeType]))

            /**
             * return first valid mime type from accept header
             */
            if (acceptedMimeTypes.length) {
                return acceptedMimeTypes[0]
            }
        }

        /**
         * return application/octet-stream as unkown mime type
         */
        return 'application/octet-stream'
    }

    requestWillBeSent () {
        const { documentURL, request, wallTime, timestamp, requestId, frameId, loaderId, type } = this
        let initiator = { type: 'other' }

        /**
         * if request id doesn't end with '.1' it is a subsequent request
         * and therefor the initiator is defined in the requestIdHost cookie
         */
        if (requestId.slice(-2) !== '.1') {
            initiator = {
                lineNumber: 0,
                type: 'parser',
                url: documentURL
            }
        }

        return Object.assign({}, {
            documentURL,
            frameId,
            requestId,
            loaderId,
            initiator,
            request,
            wallTime,
            timestamp,
            type
        })
    }

    requestServedFromCache () {
        return { requestId: this.requestId }
    }

    dataReceived (chunk) {
        const encodedData = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
        this.requestBodySize += encodedData.length
        this.chunks.push(chunk)

        return {
            requestId: this.requestId,
            dataLength: chunk.length,
            encodedDataLength: encodedData.length,
            timestamp: this.timestamp
        }
    }

    responseReceived (response) {
        this.responseHeaders = response.headers

        /**
         * update mime type
         */
        this.mimeType = response.headers['content-type'].split(';')[0]

        return {
            frameId: this.frameId,
            loaderId: this.loaderId,
            requestId: this.requestId,
            timestamp: this.timestamp,
            type: this.type,
            response: {
                requestHeaders: this.request.headers,
                headers: response.headers,
                status: response.statusCode,
                statusText: 'OK',
                mimeType: this.mimeType,
                rotocol: 'http/1.1',
                url: this.request.url,
                fromDiskCache: false,
                fromServiceWorker: false,
                encodedDataLength: this.requestBodySize
            }
        }
    }

    loadingFinished () {
        return {
            encodedDataLength: this.requestBodySize,
            requestId: this.requestId,
            timestamp: this.timestamp
        }
    }

    loadingFailed (error) {
        return {
            requestId: this.requestId,
            timestamp: this.timestamp,
            type: this.type,
            errorText: error.message,
            canceled: false
        }
    }

    get type () {
        if (
            this.req.url.match(/\.(png|jpg|jpeg|gif)$/i) ||
            this.responseHeaders['content-type'].match(/^image\//)
        ) return 'Image'

        if (
            this.req.url.match(/\.js/i) ||
            this.responseHeaders['content-type'] === 'application/javascript'
        ) return 'Script'

        if (
            this.req.url.match(/\.css/i) ||
            this.responseHeaders['content-type'] === 'text/css'
        ) return 'Stylesheet'

        if (
            this.req.url.match(/\.(html|php)/i) || path.extname(this.req.url) === '' ||
            this.responseHeaders['content-type'].match(/^application\/.*(hbbtv|html)+.*/g)
        ) return 'Document'

        if (this.req.url.match(/\.(mp4|mp3|flv|wav)/i)) return 'Media'
        if (this.req.url.match(/\.(ttf|otf|woff|woff2)/i)) return 'Font'
        if (this.req.get('Upgrade') && this.req.get('Upgrade').match(/websocket/i)) return 'WebSocket'

        return 'Other'
    }

    get timestamp () {
        return ((new Date()).getTime() - this.wallTime) / 1000
    }
}
