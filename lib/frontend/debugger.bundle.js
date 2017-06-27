import RemoteDebugger from './remoteDebugger'
import registerPolyfills from './utils/polyfills'

registerPolyfills()

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
