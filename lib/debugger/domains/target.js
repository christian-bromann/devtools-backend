/**
 * Methods
 */

/**
 * Enables target discovery for the specified locations, when setDiscoverTargets was
 * set to true.
 *
 * @param {RemoteLocation[]} locations  List of remote locations.
 */
export function setRemoteLocations () {
    return {}
}

/**
 * Controls whether to discover available targets and notify via
 * targetCreated/targetDestroyed events.
 *
 * @param {Boolean} discover  Whether to discover available targets.
 */
export function setDiscoverTargets () {
    return {}
}

/**
 * Events
 */

/**
 * Issued when a possible inspection target is created.
 * @param  {String} uuid  page target passed in by debugger service
 * @return {Object}       target info
 */
export function targetCreated ({ uuid }) {
    this.execute('Target.targetCreated', {
        targetInfo: {
            targetId: uuid,
            title: document.title,
            type: 'page',
            url: document.URL
        }
    })
}
