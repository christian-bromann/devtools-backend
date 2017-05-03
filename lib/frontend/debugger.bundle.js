import RemoteDebugger from './remoteDebugger'

window.MutationObserver = window.MutationObserver ||
    window.WebKitMutationObserver ||
    window.MozMutationObserver

const uuid = document.currentScript.getAttribute('data-uuid')
const remoteDebugger = window.remoteDebugger = new RemoteDebugger(uuid)

/**
 * store onload handler that could be defined by the HbbTV app
 */
const NOOP = () => {}
const onload = window.onload || NOOP

/**
 * trigger executionContextCreated event
 */
if (document.readyState === 'complete') {
    remoteDebugger.loadHandler(NOOP)
} else {
    window.onload = remoteDebugger.bind(remoteDebugger, onload)
}
