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
 * Controls whether to automatically attach to new targets which are considered to be related
 * to this one. When turned on, attaches to all existing related targets as well. When turned
 * off, automatically detaches from all currently attached targets.
 *
 * @param {Boolean} autoAttach              Whether to auto-attach to related targets.
 * @param {Boolean} waitForDebuggerOnStart  Whether to pause new targets when attaching to them. Use
 *                                          Runtime.runIfWaitingForDebugger to run paused targets.
 */
export function setAutoAttach ({ autoAttach, waitForDebuggerOnStart }) {
    return {}
}
