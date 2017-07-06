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
        const style = node.getAttribute('style') || ''
        const cssText = `${node.tagName.toLowerCase()} { ${style} }`

        /**
         * add inline css to store
         */
        return this.add({
            ownerNode: node,
            cssRules: style.length ? [{
                cssText,
                selectorText: node.tagName.toLowerCase(),
                type: 1
            }] : [],
            cssText
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
     * find registered stylesheet by url
     * @param  {String} url  url of stylesheet
     * @return {StyleSheet}  stylesheet object if found otherwise null
     */
    getByUrl (url) {
        for (const [, styleSheet] of Object.entries(this.styleSheets)) {
            if (styleSheet.header.sourceURL.indexOf(url) === -1) {
                continue
            }

            return styleSheet
        }

        return null
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
            /**
             * there are two ways to find the rule of given css text:
             * 1. generate a css text based on the css properties of all css rules and
             *    compare with given css text (without its selectors, selector check
             *    happens seperately)
             * 2. compare parsed css text (from document.stylesheets) with given css text
             */
            rule = arrayFind(this.styleSheets[id].rules, (rule, i) => {
                const ruleCssText = StyleSheet.sanitizeCssUnits(
                    cssText.slice(cssText.indexOf('{') + 1, cssText.lastIndexOf('}')).trim()
                )
                const expectedRuleCssText = StyleSheet.sanitizeCssUnits(
                    rule.style.cssProperties.map((prop) => prop.text).join('; ') + ';'
                )

                const matchesRawCssText = expectedRuleCssText === ruleCssText && rule.selectorList.text === selectorText
                const matchesParsedCssText = this.styleSheets[id].parsedCssRules[i] === cssText
                return matchesParsedCssText || matchesRawCssText
            })

            if (rule) {
                break
            }
        }

        if (!rule) {
            window.remoteDebugger.emit('debug', `Couldn't find stylesheet with css text: ${cssText}`)
        }

        return rule
    }
}
