import parseCss from 'css/lib/parse'

import Node from '../models/Node'
import { getInlineStyles } from '../utils/css'

let enabled = false
const name = 'CSS'

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
    const defaultRange = {
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0
    }

    let ruleList = window.getMatchedCSSRules(node)
    ruleList = ruleList ? ruleList.toArray() : []
    const matchedCSSRules = ruleList.map((rule) => {
        const cssProperties = getInlineStyles(rule.style)
        const cssPropertyNames = cssProperties.map((prop) => prop.name)
        const cssTextParsed = parseCss(rule.cssText)

        const styleSheet = this.cssStore.get(rule.parentStyleSheet.ownerNode._styleSheetId)
        const styleSheetId = styleSheet.styleSheetId
        window.parseIt = parseCss
        const range = styleSheet.getRange(rule.cssText)

        const shorthandEntries = cssTextParsed.stylesheet.rules[0].declarations
            /**
             * map it to shorthandEntries form
             * https://chromedevtools.github.io/debugger-protocol-viewer/tot/CSS/#type-ShorthandEntry
             */
            .map((declaration) => ({ name: declaration.property, value: declaration.value }))
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
                    cssText: rule.cssText,
                    range,
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
    const cssText = node.getAttribute('style') || ''

    return {
        inlineStyle: {
            cssProperties: getInlineStyles(node.style).map(extendStyle),
            cssText,
            range: { startLine: 0, startColumn: 0, endLine: 0, endColumn: cssText.length },
            shorthandEntries: [],
            styleSheetId: '1' // ToDo: connect to stylesheet file
        }
    }
}

/**
 * Returns the current textual content and the URL for a stylesheet.
 * @param  {styleSheetId} styleSheetId  id of stylesheet
 * @return {String}                     The stylesheet text
 */
export function getStyleSheetText ({ styleSheetId }) {
    const styleSheet = this.cssStore.get(styleSheetId)
    return styleSheet.getStyleSheetText()
}

export { name, enabled }
