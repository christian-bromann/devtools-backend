/**
 * Information about the Frame hierarchy along with their cached resources.
 * @return {Object} frame tree
 */
export function getResourceTree (result, requestList = []) {
    const id = result.frameTree.frame.id.split('.')[0]
    const resources = requestList.filter(
        (request) => request.requestId && request.requestId.indexOf(id) === 0
    )

    /**
     * add resource data
     */
    result.frameTree.resources = resources.map((request) => ({
        contentSize: request.requestBodySize,
        lastModified: request.wallTime,
        mimeType: request.mimeType,
        type: request.type,
        url: request.fullUrl
    }))

    return result
}
