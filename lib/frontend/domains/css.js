import Node from '../models/Node'
import { getInlineStyles } from '../utils/css'

let enabled = false
const name = 'CSS'

window.CSSRuleList.prototype.toArray = function (iterator) {
    const returnValue = []
    for (let i = 0; i < this.length; ++i) {
        returnValue.push(this[i])
    }
    return returnValue
}

const extendStyle = (style) => {
    const text = `${style.name}: ${style.value}`
    return Object.assign(style, {
        disabled: false,
        implicit: false,
        text,
        range: { startLine: 0, startColumn: 0, endLine: 0, endColumn: text.length }
    })
}

/**
 * Returns the computed style for a DOM node identified by nodeId.
 *
 * @param {NodeId} nodeId                   Id of the element to get computed styles from
 * @return {[CSSComputedStyleProperty]}     Computed style for the specified DOM node.
 */
export function getComputedStyleForNode ({ nodeId }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    const computedStyle = []
    const computedStyleOrig = window.getComputedStyle(root.node)
    for (let i = 0; i < computedStyleOrig.length; ++i) {
        computedStyle.push({
            name: computedStyleOrig[i],
            value: computedStyleOrig[computedStyleOrig[i]]
        })
    }

    return { computedStyle }
}

/**
 * Requests information about platform fonts which we used to render child TextNodes in the given node.
 */
export function getPlatformFontsForNode ({ nodeId }) {
    /**
     * this is not traceable therefor return always a standard font
     */
    return {
        familyName: 'Arial',
        isCustomFont: false,
        glyphCount: 0
    }
}

/**
 * Returns requested styles for a DOM node identified by nodeId.
 *
 * @param  {nodeId} nodeId  desired node id
 */
export function getMatchedStylesForNode ({ nodeId }) {
    const { node } = Node.getNode(nodeId)
    const ruleList = window.getMatchedCSSRules(node)
    const defaultRange = {
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0
    }

    const matchedCSSRules = ruleList.toArray().map((rule) => {
        const cssProperties = getInlineStyles(rule.style)
        const cssPropertyNames = cssProperties.map((prop) => prop.name)
        const cssText = rule.cssText.slice(rule.cssText.indexOf('{') + 1, rule.cssText.lastIndexOf(';')).trim()
        let styleSheetId = this.requestId.split('.')
        styleSheetId = styleSheetId[0] + '.' + (parseInt(styleSheetId[1]) + 10)

        const shorthandEntries = cssText
            /**
             * split rules
             */
            .split(';')
            /**
             * map it to shorthandEntries form
             * https://chromedevtools.github.io/debugger-protocol-viewer/tot/CSS/#type-ShorthandEntry
             */
            .map((rule) => {
                const cssSet = rule.split(':')
                return { name: cssSet[0].trim(), value: cssSet[1].trim() }
            })
            /**
             * filter out all properties with the same name as in cssProperties
             */
            .filter((prop) => cssPropertyNames.indexOf(prop.name) === -1)

        const rules = {
            rule: {
                media: [],
                origin: 'regular',
                selectorList: {
                    selectors: [{
                        text: rule.selectorText,
                        range: defaultRange
                    }],
                    text: rule.selectorText
                },
                style: {
                    cssProperties: cssProperties.map((style) => {
                        if (shorthandEntries.length) {
                            return style
                        }

                        return extendStyle(style)
                    }).concat(shorthandEntries.map(extendStyle)),
                    cssText,
                    range: defaultRange,
                    shorthandEntries,
                    styleSheetId
                },
                styleSheetId
            },
            matchingSelectors: [0]
        }

        if (shorthandEntries.length) {
            rules.rule.style.shorthandEntries = shorthandEntries
        }

        return rules
    })

    return {
        matchedCSSRules,
        cssKeyframesRules: [],
        pseudoElements: [],
        inherited: [],
        inlineStyle: getInlineStylesForNode({ nodeId }).inlineStyle
    }
}

/**
 * Returns the styles defined inline (explicitly in the "style" attribute and implicitly, using
 * DOM attributes) for a DOM node identified by nodeId.
 *
 * @param  {nodeId} nodeId  desired node id
 */
export function getInlineStylesForNode ({ nodeId }) {
    const { node } = Node.getNode(nodeId)
    const cssText = node.getAttribute('style')

    return {
        inlineStyle: {
            cssProperties: getInlineStyles(node.style).map(extendStyle),
            cssText,
            range: { startLine: 0, startColumn: 0, endLine: 0, endColumn: cssText ? cssText.length : 0 },
            shorthandEntries: [],
            styleSheetId: '1' // ToDo: connect to stylesheet file
        }
    }
}

/**
 * Events
 */

/**
 * Fired whenever an active document stylesheet is added.
 * @return {CSSStyleSheetHeader} Added stylesheet metainfo.
 */
export function styleSheetAdded () {
    const stylesheets = [].slice.call(document.styleSheets)
    let i = 0

    for (const stylesheet of stylesheets) {
        ++i
        let styleSheetId = this.requestId.split('.')
        styleSheetId = styleSheetId[0] + '.' + (parseInt(styleSheetId[1]) + i * 10)
        stylesheet.ownerNode._styleSheetId = styleSheetId

        this.execute('CSS.styleSheetAdded', {
            header: {
                disabled: false,
                frameId: this.frameId,
                hasSourceURL: Boolean(stylesheet.href),
                isInline: stylesheet.ownerNode.tagName.toLowerCase() === 'style',
                origin: 'regular',
                ownerNode: stylesheet.ownerNode._nodeId,
                sourceURL: stylesheet.href,
                startColumn: 0,
                startLine: 0,
                styleSheetId: styleSheetId,
                title: ''
            }
        })
    }
}

export { name, enabled }
