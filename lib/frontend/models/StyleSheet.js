import parseCss from 'css/lib/parse'
import first from 'lodash.first'

export default class StyleSheet {
    constructor (id, styleSheet) {
        this.media = [] // ToDo: figure out media usage
        this.origin = styleSheet.origin || 'regular'
        this.styleSheetId = id
        this.cssText = styleSheet.cssText
        this.ownerNode = styleSheet.ownerNode
        this.parsedCssRules = styleSheet.cssRules.map((rule) => rule.cssText)

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
        this.rules = parseCss(this.cssText).stylesheet.rules
            .filter((rule) => rule.type === 'rule')
            .map((rule) => {
                const rulePos = rule.position
                const start = rule.declarations.length ? first(rule.declarations).position.start : 0
                const lines = cssTextLines.slice(rulePos.start.line - 1, rulePos.end.line)
                let cssText = ''

                if (lines.length === 0) {
                    cssText = cssTextLines[start.line - 1]
                } else {
                    const linesJoined = lines.join('\n')
                    cssText = linesJoined.slice(linesJoined.indexOf('{') + 1, linesJoined.indexOf('}'))
                }

                const cssProperties = StyleSheet.getCssProperties(rule, cssTextLines)
                const range = cssProperties.length ? StyleSheet.getRange(
                    rulePos.start.line, rulePos.end.line - 1,
                    rulePos.start.column, rulePos.end.column - 2
                ) : StyleSheet.getRange(0, 0, 0, 0)

                return {
                    media: this.media,
                    origin: this.origin,
                    styleSheetId: this.styleSheetId,
                    selectorList: {
                        text: rule.selectors.join(', '),
                        selectors: rule.selectors.map((selector, i) => ({
                            text: selector,
                            range: StyleSheet.getRange(
                                rulePos.start.line + i - 1,
                                rulePos.start.line + i - 1,
                                0,
                                selector.length
                            )
                        }))
                    },
                    style: {
                        cssProperties,
                        cssText,
                        range,
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
        if (this.ownerNode.nodeName.toLowerCase() === 'style') {
            return { text: this.styleSheet.ownerNode.textContent }
        }

        /**
         * generate stylesheet text based of css rules
         */
        return { text: this.cssText }
    }

    setStyleText (range, text) {
        // const rule = this.cssRules[range.startColumn]
        //
        // if (!rule) {
        //     throw new Error(`Can't find rule for column ${range.startColumn}`)
        // }
        //
        // rule.cssText = text
        // return {
        //     cssProperties: [],
        //     cssText: text,
        //     shorthandEntries: [],
        //     styleSheetId: this.styleSheetId
        // }
    }

    static getCssProperties (rule, cssTextLines) {
        return rule.declarations
            .filter((declaration) => declaration.type === 'declaration')
            .map((declaration) => {
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
                        declarationPos.start.line - 1, declarationPos.end.line - 1,
                        declarationPos.start.column - 1, declarationPos.start.column + text.length
                    ),
                    text,
                    value: declaration.value
                }
            })
    }

    static getRange (startLine = 0, endLine = 0, startColumn = 0, endColumn = 0) {
        return { startLine, endLine, endColumn, startColumn }
    }

    static sanitizeCssUnits (cssText) {
        return cssText.replace(/(\s|:|,)0(%|cm|em|ex|in|mm|pc|pt|px|vh|vw|vmin|vmax)/gi, '$10')
    }
}
