import Node from '../models/Node'
import arrayFind from 'core-js/library/fn/array/find'

let enabled = false
const name = 'CSS'

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

    let ruleList = window.getMatchedCSSRules(node)
    const matchedCSSRules = [].slice.call(ruleList || []).map((rule) => ({
        matchingSelectors: [0],
        rule: this.cssStore.getRuleByCssText(rule.selectorText, rule.cssText)
    }))

    return {
        matchedCSSRules,
        cssKeyframesRules: [],
        pseudoElements: [],
        inherited: [],
        inlineStyle: getInlineStylesForNode.call(this, { nodeId }).inlineStyle
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
    let cssStyle

    if (node._styleSheetId) {
        cssStyle = this.cssStore.get(node._styleSheetId)
    } else {
        cssStyle = this.cssStore.addInlineStyleSheet(node)
    }

    return { inlineStyle: cssStyle.rules.length ? cssStyle.rules[0].style : {} }
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

/**
 * Sets the new stylesheet text.
 * @param {StyleSheetId} styleSheetId  if of style style
 * @param {String}       text          changed css style
 */
export function setStyleText ({ styleSheetId, range, text }) {
    const styleSheet = this.cssStore.get(styleSheetId)
    return styleSheet.setStyleText(range, text)
}

/**
 * Sets the new stylesheet text.
 * @param {Array} edits  list of stylesheet changes
 */
export function setStyleTexts ({ edits }) {
    const styles = []

    edits.forEach((...args) => {
        styles.push(setStyleText.apply(this, args))
    })

    return { styles }
}

export function styleSheetRegistered ({ cssText, url, ownerNode }) {
    /**
     * wait until document ready so `document.styleSheets` is not empty
     */
    if (!this.readyStateComplete) {
        return setTimeout(() => styleSheetRegistered.call(this, { cssText, url }), 100)
    }

    /**
     * check if stylesheet was already registered
     */
    const registeredStyleSheet = this.cssStore.getByUrl(url)
    if (registeredStyleSheet) {
        return this.execute('CSS.styleSheetAdded', { header: registeredStyleSheet.header })
    }

    const cssStyleSheets = [].slice.call(document.styleSheets)
    const styleSheetElement = arrayFind(
        cssStyleSheets,
        (cssStyleSheet) => cssStyleSheet.href.indexOf(url) > -1
    )

    if (!styleSheetElement) {
        return this.emit('debug', `Couldn't register stylesheet, url not found ${url}`)
    }

    const styleSheet = this.cssStore.add({
        href: styleSheetElement.href,
        cssRules: [].slice.call(styleSheetElement.cssRules),
        ownerNode: styleSheetElement.ownerNode,
        cssText
    })
    this.execute('CSS.styleSheetAdded', { header: styleSheet.header })
}

export { name, enabled }
