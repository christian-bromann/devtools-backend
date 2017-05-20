import RemoteDebugger from './remoteDebugger'
window.MutationObserver = window.MutationObserver ||
    window.WebKitMutationObserver ||
    window.MozMutationObserver

const uuid = document.currentScript ? document.currentScript.getAttribute('data-uuid') : window._uuid
const remoteDebugger = window.remoteDebugger = new RemoteDebugger(uuid)

/**
 * trigger executionContextCreated event
 */
document.onreadystatechange = function () {
    if (document.readyState === 'complete') {
        remoteDebugger.loadHandler()
    }
}
