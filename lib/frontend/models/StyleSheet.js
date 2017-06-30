import parseCss from 'css/lib/parse'
import first from 'lodash.first'
import last from 'lodash.last'

export default class StyleSheet {
    constructor (id, styleSheet) {
        this.media = [] // ToDo: figure out media usage
        this.origin = styleSheet.origin || 'regular'
        this.styleSheetId = id
        this.cssText = styleSheet.cssText

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

        const cssTextLines = this.cssText.split('\n')
        this.rules = parseCss(this.cssText).stylesheet.rules.map((rule) => {
            const rulePos = rule.position
            const start = first(rule.declarations).position.start
            const end = last(rule.declarations).position.end
            const lines = cssTextLines.slice(start.line - 1, end.line)
            let cssText = ''

            if (lines.length === 0) {
                cssText = cssTextLines[start.line - 1]
            } else {
                const linesJoined = lines.join('\n')
                cssText = linesJoined.slice(start.column - 1, linesJoined.length - (last(lines).length - end.column))
            }

            return {
                media: this.media,
                origin: this.origin,
                styleSheetId: this.styleSheetId,
                selectorList: {
                    text: rule.selectors.join(', '),
                    selectors: rule.selectors.map((selector, i) => ({
                        text: selector,
                        range: StyleSheet.getRange(
                            rule.position.start.line + i,
                            rule.position.start.line + i,
                            1,
                            selector.length + 1
                        )
                    }))
                },
                style: {
                    cssProperties: rule.declarations.map((declaration) => {
                        const declarationPos = declaration.position
                        const declarationLine = cssTextLines[declarationPos.start.line - 1]
                        const text = declarationLine.slice(
                            declarationPos.start.column - 1,
                            declarationPos.end.column - 1
                        )

                        return {
                            disabled: false,
                            implicit: false,
                            important: Boolean(text.match(/!important/)),
                            name: declaration.property,
                            range: StyleSheet.getRange(
                                declarationPos.start.line, declarationPos.end.line,
                                declarationPos.start.column, declarationPos.end.column
                            ),
                            text,
                            value: declaration.value
                        }
                    }),
                    cssText,
                    range: StyleSheet.getRange(
                        rulePos.start.line, rulePos.end.line,
                        rulePos.start.column, rulePos.end.column
                    ),
                    shorthandEntries: [],
                    styleSheetId: this.styleSheetId
                }
            }
        })
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

    static getRange (startLine = 0, endLine = 0, startColumn = 0, endColumn = 0) {
        return { startLine, endLine, endColumn, startColumn }
    }
}
