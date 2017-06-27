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
}
