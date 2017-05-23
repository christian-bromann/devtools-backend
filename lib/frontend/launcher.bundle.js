import { getTitle, getDescription, request } from './utils/common'
import RemoteDebugger from './remoteDebugger'

const NOOP = () => {}

window.MutationObserver = window.MutationObserver ||
    window.WebKitMutationObserver ||
    window.MozMutationObserver

const program = function () {
    const currentScript = document.currentScript || [].slice.call(document.querySelectorAll('script')).filter(
        (script) => script.getAttribute('src') && script.getAttribute('src').indexOf('launcher.js') > -1
    )[0]
    const devtoolsBackendHost = currentScript.src.split('/').slice(2, 3)[0]
    const uuid = currentScript.getAttribute('data-uuid') || document.location.host

    /**
     * register TV
     */
    const { appName, appCodeName, appVersion, product, platform, vendor, userAgent } = navigator
    const description = getDescription()
    const title = getTitle()
    request(`http://${devtoolsBackendHost}/register`, {
        uuid,
        url: document.location.href,
        description,
        title,
        hostname: devtoolsBackendHost,
        metadata: { appName, appCodeName, appVersion, product, platform, vendor, userAgent }
    })

    const remoteDebugger = window.remoteDebugger = new RemoteDebugger(uuid)

    /**
     * trigger executionContextCreated event
     */
    const origOnReadyStateChange = document.onreadystatechange || NOOP
    document.onreadystatechange = function () {
        if (document.readyState === 'complete') {
            remoteDebugger.loadHandler()
        }

        origOnReadyStateChange()
    }

    const origOnError = window.onerror || NOOP
    window.onerror = function (errorMsg, url, lineNumber) {
        console.error(errorMsg)
        origOnError(errorMsg, url, lineNumber)
    }
}

try {
    program()
} catch (error) {
    console.error('Something went wrong connecting to devtools backend:', error.message)
}
