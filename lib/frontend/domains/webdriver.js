import Node from '../models/Node'

import { getTitle } from '../utils/common'

const W3C_ELEMENT_ID = 'element-6066-11e4-a52e-4f735466cecf'
let elementCache = []

/**
 * Helper
 */

/**
* find elements by css selector
* @param  {String} selector   css selector
* @param  {HTMLElement} root  context node
* @return {HTMLElement[]}     list if elements matching xpath
*/
function findByCssSelector (selector, root) {
    return root.querySelectorAll(selector)
}

/**
* find element by xpath
* @param  {String} selector   xpath selector
* @param  {HTMLElement} root  context node
* @return {HTMLElement[]}     list of elements matching xpath
*/
function findByXPath (selector, root) {
    const result = document.evaluate(selector, root, null, 0, null)
    const elements = []

    let value = result.iterateNext()
    while (value) {
        elements.push(value)
        value = result.iterateNext()
    }

    return elements
}

function find ({ using, value }, fromElement) {
    const root = fromElement instanceof HTMLElement ? fromElement : document
    var elements

    switch (using) {
    case 'id':
        elements = findByCssSelector(`#${value}`, root)
        break
    case 'css selector':
        elements = findByCssSelector(value, root)
        break
    case 'link text':
        elements = findByXPath(`//a[text()[normalize-space()]="${value}"]`, root)
        break
    case 'partial link text':
        elements = findByXPath(`//a[contains(text()[normalize-space()],"${value}")]`, root)
        break
    case 'xpath':
        elements = findByXPath(value, root)
    }

    /**
     * format
     */
    const result = [].slice.call(elements).map((element) => {
        /**
         * check if element is already in cache
         */
        const cachedElement = elementCache.filter((e) => e.element === element)[0]
        if (cachedElement) {
            return cachedElement
        }

        /**
         * make sure node is available in node store
         */
        let node = Node.getNode(element._nodeId)
        if (!node) {
            node = new Node(element)
        }

        return {
            uuid: node.nodeId, // ToDo have check if nodeId exists
            using,
            value,
            element
        }
    })
    /**
     * don't append empty (filtered) entries
     */
    .filter((e) => Boolean(e))

    /**
     * cache element
     */
    elementCache = elementCache.concat(result)
    return result.map((result) => ({
        [W3C_ELEMENT_ID]: result.uuid
    }))
}

/**
 * returns cached HTMLElement
 * @param  {String} uuid  id of cached element
 * @return {HTMLElement}  cached element
 */
function get (uuid) {
    const element = elementCache.filter((e) => e.uuid === uuid)[0]
    return element ? element.element : undefined
}

/**
 * methods
 */

/**
 * The Find Element command is used to find an element in the current browsing context
 * that can be used for future commands.
 *
 * @param {String}  using  selector strategy
 * @param {Srting}  value  selector
 * @return {Object}        element
 */
export function findElement ({ using, value }) {
    return find({ using, value })[0]
}

/**
 * The Find Elements command is used to find elements in the current browsing context
 * that can be used for future commands.
 *
 * @param {String}  using  selector strategy
 * @param {Srting}  value  selector
 * @return {Object[]}      elements
 */
export function findElements ({ using, value }) {
    return find({ using, value })
}

/**
 * The Find Element From Element command is used to find an element from a web element
 * in the current browsing context that can be used for future commands.
 *
 * @param  {String} elementId  element uuid
 * @param  {String} using      selector strategy
 * @param  {Srting} value      selector
 * @return {Object}            element
 */
export function findElementFromElement ({ elementId, using, value }) {
    const nodeContext = get(elementId)
    return find({ using, value }, nodeContext)[0]
}

/**
 * The Find Elements From Element command is used to find elements from a web element
 * in the current browsing context that can be used for future commands.
 *
 * @param  {String} elementId  element uuid
 * @param  {String} using      selector strategy
 * @param  {Srting} value      selector
 * @return {Object}            elements
 */
export function findElementsFromElement ({ elementId, using, value }) {
    const nodeContext = get(elementId)
    return find({ using, value }, nodeContext)
}

/**
 * The Get Element Text command intends to return an element’s text “as rendered”.
 * This is approximately equivalent to calling element.innerText. An element’s rendered
 * text is also used for locating a elements by their link text and partial link text.
 *
 * @param  {NodeId} nodeId  node to get text content from
 * @return {String}         text content
 */
export function getText ({ nodeId }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    return { text: root.node.innerText }
}

/**
 * The Get Element Rect command returns the dimensions and coordinates of the given
 * web element.
 *
 * @param  {NodeId} nodeId  node to get text content from
 * @return {Object}         object with x, y, width and height properties
 */
export function getElementRect ({ nodeId }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    const rect = root.node.getBoundingClientRect()

    /**
     * The returned value is a dictionary with the following members:
     */
    return {
        /**
         * X axis position of the top-left corner of the web element relative to
         * the current browsing context’s document element in CSS reference pixels.
         * @type {Number}
         */
        x: rect.left,
        /**
         * Y axis position of the top-left corner of the web element relative to
         * the current browsing context’s document element in CSS reference pixels.
         * @type {Number}
         */
        y: rect.top,
        /**
         * Height of the web element’s bounding rectangle in CSS reference pixels.
         * @type {Number}
         */
        width: rect.width,
        /**
         * Width of the web element’s bounding rectangle in CSS reference pixels.
         * @type {Number}
         */
        height: rect.height
    }
}

/**
 * The Get Element Property command will return the result of getting a property of an element.
 *
 * @param  {NodeId} nodeId  node to get property from
 * @return {String}         property value
 */
export function getElementProperty ({ nodeId, property }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    return { value: root.node[property] }
}

export function title () {
    return { value: getTitle() }
}
