import parseCss from 'css/lib/parse'

const NULL_RANGE = {
    endColumn: 0,
    endLine: 0,
    startColumn: 0,
    startLine: 0
}

export default class StyleSheet {
    constructor (id, styleSheet) {
        this.media = [] // ToDo: figure out media usage
        this.origin = styleSheet.origin || 'regular'
        this.styleSheetId = id

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

        this.rules = [].slice.call(styleSheet.cssRules).filter((rule) => rule.type === 1).map((rule) => {
            const parsedText = parseCss(rule.cssText).stylesheet.rules[0]
            return {
                media: this.media,
                origin: this.origin,
                styleSheetId: this.styleSheetId,
                selectorList: {
                    text: rule.selectorText,
                    selectors: parsedText.selectors.map((selector) => ({
                        text: selector.trim(),
                        range: NULL_RANGE
                    }))
                },
                style: {
                    cssProperties: parsedText.declarations.map((declaration) => ({
                        disabled: false,
                        implicit: false,
                        important: Boolean(declaration.value.match(/!important/)),
                        name: declaration.property,
                        range: NULL_RANGE,
                        text: `${declaration.property}:${declaration.value};`,
                        value: declaration.value
                    })),
                    cssText: rule.cssText.slice(rule.cssText.indexOf('{') + 1, rule.cssText.lastIndexOf('}')).trim(),
                    range: NULL_RANGE,
                    shorthandEntries: [],
                    styleSheetId: this.styleSheetId
                }
            }
        })

        /**
         * ToDo remove once ported
         */
        this.styleSheet = styleSheet
        this.cssRules = [].slice.call(this.styleSheet.cssRules)
    }

    getStyleSheetText () {
        /**
         * return style content if inline
         */
        if (this.styleSheet.ownerNode.nodeName.toLowerCase() === 'style') {
            return { text: this.styleSheet.ownerNode.textContent }
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

    setStyleText (range, text) {
        const rule = this.cssRules[range.startColumn]

        if (!rule) {
            throw new Error(`Can't find rule for column ${range.startColumn}`)
        }

        rule.cssText = text
        return {
            cssProperties: [],
            cssText: text,
            shorthandEntries: [],
            styleSheetId: this.styleSheetId
        }
    }
}
