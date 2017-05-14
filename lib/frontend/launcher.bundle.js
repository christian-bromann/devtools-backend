import xhr from 'xhr'
import { getTitle, getDescription } from './utils/common'

function getScriptTag (src, attrs = {}) {
    const script = document.createElement('script')
    script.setAttribute('data-origin', 'debugger')

    for (const [key, value] of Object.entries(attrs)) {
        script.setAttribute(key, value)
    }

    script.src = src
    return script
}

/**
 * simple wrapper to do POST request with xhr
 */
function request (url, json) {
    return new Promise((resolve, reject) => {
        xhr.post({
            url,
            json,
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        }, (err, res) => {
            if (err) {
                return reject(err)
            }

            return resolve(res)
        })
    })
}

const program = async function () {
    const currentScript = document.currentScript || [].slice.call(document.querySelectorAll('script')).filter(
        (script) => script.getAttribute('src') && script.getAttribute('src').indexOf('launcher.js') > -1
    )[0]
    const devtoolsBackendHost = currentScript.src.split('/').slice(2, 3)[0]
    const nextSibling = currentScript.nextSibling
    const uuid = currentScript.getAttribute('data-uuid') || document.location.host

    /**
     * register TV
     */
    const { appName, appCodeName, appVersion, product, platform, vendor, userAgent } = navigator
    const description = getDescription()
    const title = getTitle()
    await request(`http://${devtoolsBackendHost}/register`, {
        uuid,
        url: document.location.href,
        description,
        title,
        hostname: devtoolsBackendHost,
        metadata: { appName, appCodeName, appVersion, product, platform, vendor, userAgent }
    })

    /**
     * insert scripts
     */
    const ioScript = getScriptTag(`http://${devtoolsBackendHost}/socket.io/socket.io.js`)
    currentScript.parentNode.insertBefore(ioScript, nextSibling)

    /**
     * ensure socket.io is loaded before injected driver scripts
     */
    ioScript.onload = () => {
        currentScript.parentNode.insertBefore(
            getScriptTag(`http://${devtoolsBackendHost}/scripts/debugger.js`, { 'data-uuid': uuid }),
            nextSibling
        )
    }
}

function printError (error) {
    return console.error('Something went wrong connecting to devtools backend:', error.message)
}

if (document.currentScript) {
    program().catch(printError)
} else {
    document.addEventListener('DOMContentLoaded', () => program().catch(printError))
}
