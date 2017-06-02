export default class StyleSheet {
    constructor (id, styleSheet) {
        this.styleSheetId = id
        this.styleSheet = styleSheet
        this.cssRules = [].slice.call(this.styleSheet.cssRules)

        this.header = {
            disabled: false,
            frameId: window.remoteDebugger.frameId,
            hasSourceURL: Boolean(styleSheet.href),
            isInline: styleSheet.ownerNode.tagName.toLowerCase() === 'style',
            origin: 'regular',
            ownerNode: styleSheet.ownerNode._nodeId,
            sourceURL: styleSheet.href,
            startColumn: 0,
            startLine: 0,
            styleSheetId: this.styleSheetId,
            title: ''
        }
    }

    getStyleSheetText () {
        /**
         * return style content if inline
         */
        if (this.styleSheet.ownerNode.nodeName.toLowerCase() === 'style') {
            return { text: this.ownerNode.textContent }
        }

        /**
         * generate stylesheet text based of css rules
         */
        const cssRules = this.cssRules.map(
            (rule) => rule.cssText.replace('{', '{\n   ').replace(/; /g, ';\n    ').replace('    }', '}\n')
        ).join('\n')
        return { text: cssRules }
    }

    getRange (cssText) {
        const startColumn = this.cssRules.findIndex((rule) => rule.cssText === cssText)
        return {
            endColumn: 0,
            endLine: 0,
            startColumn,
            startLine: 0
        }
    }
}
