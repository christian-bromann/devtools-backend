/**
 * helper for Debugger.getScriptSource to return script content if script was fetched
 * from external source
 */
export function getScriptSource (result, requestList = []) {
    /**
     * return if result already contains script content
     */
    if (typeof result.src !== 'string') {
        return result
    }

    const request = requestList.filter((req) => req.fullUrl.includes(result.src))[0]

    /**
     * don't do anything if request was not found in request list
     */
    if (!request) {
        return result
    }

    result.scriptSource = request.chunks.join('')
    delete result.src
    return result
}
