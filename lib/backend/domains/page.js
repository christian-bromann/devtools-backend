/**
 * Fired once navigation of the frame has completed. Frame is now associated with
 * the new loader.
 */
export function frameNavigated (frameId, origin, url) {
    this.broadcast({
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
