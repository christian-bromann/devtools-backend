import RemoteDebugger from './remoteDebugger'
import registerPolyfills from './utils/polyfills'
import { getStacktrace } from './utils/runtime'

registerPolyfills()

const uuid = document.currentScript ? document.currentScript.getAttribute('data-uuid') : window._uuid
const remoteDebugger = window.remoteDebugger = new RemoteDebugger(uuid)

/**
 * trigger executionContextCreated event
 */
document.onreadystatechange = function () {
    if (document.readyState === 'complete') {
        remoteDebugger.loadHandler()
        const appMan = document.getElementById('debuggerAppMan')
        if (appMan) {
            const app = appMan.getOwnerApplication(document)
            app.show()
        }
    }
}

window.onerror = function (errorMsg, url, lineNumber) {
    const err = new Error(errorMsg)
    err.stack = `${errorMsg}\n\tat ${url}:${lineNumber}:1`
    remoteDebugger.execute('Runtime.consoleAPICalled', {
        args: [errorMsg],
        executionContext: remoteDebugger.executionContextId,
        stackTrace: { callFrames: getStacktrace(err) },
        timestamp: (new Date()).getTime(),
        type: 'error'
    })
}
