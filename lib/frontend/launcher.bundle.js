import xhr from 'xhr'

const currentScript = document.currentScript
const devtoolsBackendHost = currentScript.src.split('/').slice(2, 3)[0]
const nextSibling = currentScript.nextSibling
const uuid = currentScript.getAttribute('data-uuid') || document.location.host

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
     * get document description
     */
    let description = ''
    const metaTags = document.querySelectorAll('meta')
    for (let i = 0; i < metaTags.length; ++i) {
        const tag = metaTags[i]
        if (tag.getAttribute('name') !== 'description') {
            continue
        }

        description = tag.getAttribute('value')
    }

    /**
     * get document title
     */
    let title = ''
    const titleTag = document.querySelector('title')
    if (titleTag) {
        title = titleTag.text
    }

    /**
     * register TV
     */
    const { appName, appCodeName, appVersion, product, platform, vendor, userAgent } = navigator
    const result = await request(`http://${devtoolsBackendHost}/register`, {
        uuid,
        url: document.location.href,
        description,
        title,
        devtoolsBackendHost,
        metadata: { appName, appCodeName, appVersion, product, platform, vendor, userAgent }
    })

    if (!result || !result.body) {
        console.error('malformed launcher response', result)
        return
    }

    /**
     * insert scripts
     */
    const { uuid: serverUuid } = result.body
    const ioScript = getScriptTag(`http://${devtoolsBackendHost}/socket.io/socket.io.js`)
    currentScript.parentNode.insertBefore(ioScript, nextSibling)

    /**
     * ensure socket.io is loaded before injected driver scripts
     */
    ioScript.onload = () => {
        currentScript.parentNode.insertBefore(
            getScriptTag(`http://${devtoolsBackendHost}/scripts/debugger.js`, { 'data-uuid': serverUuid }),
            nextSibling
        )
    }
}

program().catch((error) => {
    console.error('Something went wrong connecting to devtools backend:', error.message)
})
