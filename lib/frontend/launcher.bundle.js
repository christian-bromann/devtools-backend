import xhr from 'xhr'

const currentScript = document.currentScript
const devtoolsBackendHost = currentScript.src.split('/').slice(2, 3)[0]
const nextSibling = currentScript.nextSibling

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
    /**
     * register TV
     */
    const { appName, appCodeName, appVersion, product, platform, vendor, userAgent } = navigator
    const result = await request(`http://${devtoolsBackendHost}/register`, {
        appName, appCodeName, appVersion, product, platform, vendor, userAgent
    })

    if (!result || !result.body) {
        console.error('malformed launcher response', result)
        return
    }

    /**
     * insert scripts
     */
    const { host, port, uuid } = result.body
    const ioScript = getScriptTag(`http://${host}:${port}/socket.io/socket.io.js`)
    currentScript.parentNode.insertBefore(ioScript, nextSibling)

    /**
     * ensure socket.io is loaded before injected driver scripts
     */
    ioScript.onload = () => {
        currentScript.parentNode.insertBefore(
            getScriptTag(`http://${host}:${port}/scripts/debugger.js`, { 'data-uuid': uuid }),
            nextSibling
        )
    }
}

program().catch((error) => {
    console.error('Something went wrong connecting to devtools backend:', error.message)
})
