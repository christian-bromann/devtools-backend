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
        return this.styleSheets[id]
    }

    get (styleSheetId) {
        const styleSheet = this.styleSheets[styleSheetId]

        if (!styleSheet) {
            throw new Error(`Can't find StyleSheet model with id ${styleSheetId}`)
        }

        return styleSheet
    }
}
