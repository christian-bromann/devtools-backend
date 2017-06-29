import arrayFind from 'core-js/library/fn/array/find'

import StyleSheet from './StyleSheet'

export default class CSSStore {
    constructor (requestId) {
        this.requestId = requestId
        this.styleSheets = {}
    }

    add (cssStyleSheet) {
        let id = this.requestId.split('.')
        id = id[0] + '.' + (parseInt(id[1]) + (Object.keys(this.styleSheets).length + 1) * 10)
        this.styleSheets[id] = new StyleSheet(id, cssStyleSheet)
        cssStyleSheet.ownerNode._styleSheetId = id
        return this.styleSheets[id]
    }

    addInlineStyleSheet (node) {
        const cssText = node.getAttribute('style') || ''

        /**
         * add inline css to store
         */
        return this.add({
            ownerNode: node,
            cssRules: [{
                cssText: `${node.tagName} { ${cssText} }`,
                selectorText: node.tagName.toLowerCase(),
                type: 1
            }]
        })
    }

    get (styleSheetId) {
        const styleSheet = this.styleSheets[styleSheetId]

        if (!styleSheet) {
            throw new Error(`Can't find StyleSheet model with id ${styleSheetId}`)
        }

        return styleSheet
    }

    /**
     * more computing but low lever support for getting a stylesheet based on a CSS rule
     */
    getRuleByCssText (selectorText, cssText) {
        let rule

        /**
         * try to find rule with same selector and text in one of the
         * registered stylesheets
         */
        for (const id of Object.keys(this.styleSheets)) {
            rule = arrayFind(this.styleSheets[id].rules, (rule) => {
                const ruleCssText = cssText.slice(cssText.indexOf('{') + 1, cssText.lastIndexOf('}')).trim()
                return rule.style.cssText === ruleCssText && rule.selectorList.text === selectorText
            })

            if (rule) {
                break
            }
        }

        if (!rule) {
            throw new Error(`Couldn't find stylesheet with css text: ${cssText}`)
        }

        return rule
    }
}
