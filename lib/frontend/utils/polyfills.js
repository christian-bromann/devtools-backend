export default function () {
    if (!('remove' in Element.prototype)) {
        Element.prototype.remove = function () {
            this.parentNode.removeChild(this)
        }
    }

    window.MutationObserver = window.MutationObserver ||
        window.WebKitMutationObserver ||
        window.MozMutationObserver

    /**
     * Helper for CSSRuleList to easily iterate over their values
     */
    CSSRuleList.prototype.toArray = function () {
        const returnValue = []
        for (let i = 0; i < this.length; ++i) {
            returnValue.push(this[i])
        }
        return returnValue
    }

    /**
     * Helper for NamedNodeMap to easily iterate over their values
     */
    NamedNodeMap.prototype.toArray = function () {
        const returnValue = []
        for (let i = 0; i < this.length; ++i) {
            returnValue.push({ name: this[i].name, value: this[i].nodeValue })
        }
        return returnValue
    }

    if (!('findIndex' in Array.prototype)) {
        Array.prototype.findIndex = function (predicate) { // eslint-disable-line
            if (this == null) {
                throw new TypeError('Array.prototype.findIndex called on null or undefined')
            }
            if (typeof predicate !== 'function') {
                throw new TypeError('predicate must be a function')
            }
            const list = Object(this)
            const length = list.length >>> 0
            const thisArg = arguments[1]
            let value

            for (var i = 0; i < length; i++) {
                value = list[i]
                if (predicate.call(thisArg, value, i, list)) {
                    return i
                }
            }
            return -1
        }
    }
}
