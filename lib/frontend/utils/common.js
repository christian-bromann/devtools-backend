/**
 * Helper for NamedNodeMap to easily iterate over their values
 */
window.NamedNodeMap.prototype.toArray = function () {
    const returnValue = []
    for (let i = 0; i < this.length; ++i) {
        returnValue.push({ name: this[i].name, value: this[i].nodeValue })
    }
    return returnValue
}

const flatten = arr => arr.reduce(
    (acc, val) => acc.concat(
        Array.isArray(val) ? flatten(val) : val
    ),
    []
)

export function getAttributes (namedNodeMap) {
    /**
     * ensure text nodes aren't accidentely being parsed for attributes
     */
    if (!namedNodeMap) {
        return
    }

    const attributes = namedNodeMap.toArray().map((attr) => [attr.name, attr.value])
    return flatten(attributes)
}

/**
 * get origin of backend depending on whether scripts get injected or referenced
 * by launcher
 */
export function getDriverOrigin () {
    /**
     * check if executed by launcher script
     */
    if (document.currentScript && document.currentScript.src) {
        return `http://${document.currentScript.src.split('/').slice(2, 3)[0]}`
    }

    if (document.currentScript && document.currentScript.getAttribute('data-proxy-host')) {
        return `http://${document.currentScript.getAttribute('data-proxy-host')}`
    }

    if (window._proxyHost) {
        return window._proxyHost
    }

    return 'http://localhost:9222'
}

export function getTitle () {
    /**
     * get document title
     */
    let title = ''
    const titleTag = document.querySelector('title')
    if (titleTag) {
        title = titleTag.text
    }

    return title
}

export function getDescription () {
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

        description = tag.getAttribute('content')
    }

    return description
}
