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
