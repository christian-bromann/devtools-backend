import RemoteDebugger from './remoteDebugger'

window.MutationObserver = window.MutationObserver ||
    window.WebKitMutationObserver ||
    window.MozMutationObserver

const uuid = document.currentScript.getAttribute('data-uuid')
const remoteDebugger = window.remoteDebugger = new RemoteDebugger(uuid)

/**
 * store onload handler that could be defined by the HbbTV app
 */
const onload = window.onload || (() => {})

/**
 * trigger executionContextCreated event
 */
window.onload = () => {
    remoteDebugger.domains.Runtime.executionContextCreated.call(remoteDebugger)
    remoteDebugger.domains.CSS.styleSheetAdded.call(remoteDebugger)
    remoteDebugger.domains.Debugger.scriptParsed.call(remoteDebugger)
    remoteDebugger.domains.Page.frameStoppedLoading.call(remoteDebugger)
    remoteDebugger.domains.Page.loadEventFired.call(remoteDebugger)
    remoteDebugger.domains.DOM.documentUpdated.call(remoteDebugger)
    onload()
}
