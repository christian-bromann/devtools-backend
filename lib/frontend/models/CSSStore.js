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
    getStyleSheetByCssText (cssText) {
        const styleSheet = Object.entries(this.styleSheets).filter(([frameId, styleSheet]) => {
            return styleSheet.cssRules.filter((rule) => rule.cssText === cssText).length > 0
        })[0]

        if (!styleSheet) {
            return null
        }

        return styleSheet[1]
    }
}
