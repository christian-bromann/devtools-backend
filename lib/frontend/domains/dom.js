import Node from '../models/Node'
import ObjectStore from '../models/ObjectStore'
import { PropertyObject } from '../models/PropertyObject'
import { getDomNodes, getColorFormatted, setNodeIds } from '../utils/dom'
import { getAttributes as _getAttributes } from '../utils/common'

let enabled = false
const name = 'DOM'
const HIGHLIGHT_NODE_ID = '_highlightedNode'
const inspectedNodes = []

/**
 * Returns the root DOM node (and optionally the subtree) to the caller.
 *
 * @param  {integer} depth   The maximum depth at which children should be retrieved, defaults to 1.
 *                           Use -1 for the entire subtree or provide an integer larger than 0.
 *                           (experimental)
 * @param  {boolean} pierce  Whether or not iframes and shadow roots should be traversed when returning
 *                           the subtree (default is false). (experimental)
 * @return {root}            Resulting node.
 */
export function getDocument ({ depth = 1, pierce }) {
    const root = new Node(document)
    getDomNodes(root, depth, pierce)
    return { root }
}

/**
 * Requests that children of the node with given id are returned to the caller in form of setChildNodes
 * events where not only immediate children are retrieved, but all children down to the specified depth.
 *
 * @param  {NodeId} nodeId   Id of the node to get children for.
 * @param  {integer} depth   The maximum depth at which children should be retrieved, defaults to 1.
 *                           Use -1 for the entire subtree or provide an integer larger than 0.
 *                           (experimental)
 * @param  {boolean} pierce  Whether or not iframes and shadow roots should be traversed when returning
 *                           the subtree (default is false). (experimental)
 */
export function requestChildNodes ({ nodeId, depth = 1, pierce }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    getDomNodes(root, depth, pierce)
    this.execute('DOM.setChildNodes', {
        parentId: nodeId,
        nodes: root.children
    })

    return {}
}

/**
 * Returns node's HTML markup.
 * @param  {NodeId} nodeId  Id of the node to get markup for.
 * @return {String}         Outer HTML markup.
 */
export function getOuterHTML ({ nodeId }) {
    const node = Node.getNode(nodeId)

    if (!node) {
        return {}
    }

    const outerHTML = node.node.outerHTML
    return { outerHTML }
}

/**
 * Sets node HTML markup, returns new node id.
 * @param {NodeId} nodeId    Id of the node to set markup for.
 * @param {String} outerHTML Outer HTML markup to set.
 */
export function setOuterHTML ({ nodeId, outerHTML }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        return {}
    }

    const elem = root.node
    const dp = new DOMParser()
    const dom = dp.parseFromString(`<div>${outerHTML}</div>`, 'text/xml')

    /**
     * remove origin node
     */
    this.execute('DOM.childNodeRemoved', {
        nodeId: root.nodeId,
        parentNodeId: elem.parentNode._nodeId
    })

    let lastNodeId = elem.previousElementSibling ? elem.previousElementSibling._nodeId : elem.parentNode._nodeId
    for (let i = 0; i < dom.documentElement.childNodes.length; i++) {
        const el = dom.documentElement.childNodes[i]

        setNodeIds(el)
        const node = new Node(el)

        elem.parentNode.insertBefore(el.cloneNode(), elem)
        this.execute('DOM.childNodeInserted', {
            node: {
                attributes: node.getFlattenedAttributes(),
                childNodeCount: node.childNodeCount,
                localName: node.localName,
                nodeId: node.nodeId,
                nodeName: node.nodeName,
                nodeType: node.nodeType,
                nodeValue: node.nodeValue
            },
            parentNodeId: elem.parentNode._nodeId,
            previousNodeId: lastNodeId
        })
        lastNodeId = el._nodeId
    }

    elem.remove()
    return {}
}

/**
 * Removes attribute with given name from an element with given id.
 * @param  {nodeId} nodeId Id of the element to remove attribute from.
 * @param  {String} name   Name of the attribute to remove.
 */
export function removeAttribute ({ nodeId, name }) {
    const node = Node.getNode(nodeId)

    if (!node) {
        return {}
    }

    const elem = node.node
    elem.removeAttribute(name)
    return {}
}

/**
 * Removes node with given id.
 * @param  {NodeId} nodeId  Id of the node to remove.
 */
export function removeNode ({ nodeId }) {
    const node = Node.getNode(nodeId)

    if (!node) {
        return {}
    }

    const elem = node.node
    elem.remove()

    return {}
}

/**
 * Hides DOM node highlight.
 */
export function hideHighlight () {
    const highlightNode = document.getElementById(HIGHLIGHT_NODE_ID)

    if (highlightNode) {
        highlightNode.remove()
    }

    return {}
}

/**
 * Highlights DOM node with given id or with the given JavaScript object wrapper. Either nodeId or objectId must be specified.
 *
 * @param  {highlightConfig}        highlightConfig  A descriptor for the highlight appearance.
 * @param  {NodeId}                 nodeId           Identifier of the node to highlight.
 */
export function highlightNode ({ highlightConfig, nodeId, objectId }) {
    let node

    if (typeof nodeId === 'number') {
        /**
         * get node by node id
         */
        node = Node.getNode(nodeId).node
    } else if (typeof objectId === 'string') {
        /**
         * get node from object store
         */
        node = ObjectStore.getByObjectId(objectId)
    } else {
        throw new Error('Neither nodeId nor objectId was given to get the node')
    }

    /**
     * remove highlighted node if existing
     */
    hideHighlight()

    /**
     * check if node is visible
     */
    if (!(node.offsetWidth || node.offsetHeight)) {
        return {}
    }

    /**
     * highlight container node
     */
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.position = 'absolute'
    container.style.left = `0px`
    container.style.top = `0px`
    container.id = HIGHLIGHT_NODE_ID
    document.body.appendChild(container)

    const computedStyle = window.getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    const {
        contentColor,
        paddingColor,
        marginColor
    } = highlightConfig

    /**
     * node to highlight element
     */
    const elemNode = document.createElement('div')
    elemNode.style.backgroundColor = getColorFormatted(contentColor)
    elemNode.style.width = `${rect.width - parseInt(computedStyle.paddingRight, 10) - parseInt(computedStyle.paddingLeft, 10)}px`
    elemNode.style.height = `${rect.height - parseInt(computedStyle.paddingTop, 10) - parseInt(computedStyle.paddingBottom, 10)}px`

    /**
     * node to highlight padding
     */
    const paddingNode = document.createElement('div')
    paddingNode.style.borderColor = getColorFormatted(paddingColor)
    paddingNode.style.borderStyle = 'solid'
    paddingNode.style.borderWidth = `${computedStyle.paddingTop} ${computedStyle.paddingRight} ${computedStyle.paddingLeft} ${computedStyle.paddingBottom}`
    paddingNode.style.position = 'absolute'
    paddingNode.style.left = `${rect.left + window.scrollX}px`
    paddingNode.style.top = `${rect.top + window.scrollY}px`
    paddingNode.style.zIndex = 10001
    paddingNode.appendChild(elemNode)
    container.appendChild(paddingNode)

    /**
     * node to highlight margin
     */
    const marginNode = document.createElement('div')
    const paddingNodeRect = paddingNode.getBoundingClientRect()
    marginNode.style.borderColor = getColorFormatted(marginColor)
    marginNode.style.backgroundColor = getColorFormatted(marginColor)
    marginNode.style.borderStyle = 'solid'
    marginNode.style.borderWidth = `${computedStyle.marginTop} ${computedStyle.marginRight} ${computedStyle.marginLeft} ${computedStyle.marginBottom}`
    marginNode.style.width = `${paddingNodeRect.width}px`
    marginNode.style.height = `${paddingNodeRect.height}px`

    /**
     * set position styles
     */
    marginNode.style.position = 'absolute'
    marginNode.style.left = `${rect.left - parseInt(computedStyle.marginLeft, 10) + window.scrollX}px`
    marginNode.style.top = `${rect.top - parseInt(computedStyle.marginTop, 10) + window.scrollY}px`
    marginNode.style.zIndex = 10000
    container.appendChild(marginNode)

    return {}
}

/**
 * Sets node value for a node with given id.
 *
 * @param {NodeId} nodeId  Id of the node to set value for.
 * @param {String} value   New node's value.
 */
export function setNodeValue ({ nodeId, value }) {
    const root = Node.getNode(nodeId)

    /**
     * set characterDataModified flag so the node object doesn't send update event
     * to the frontend again
     */
    root.node._characterDataModified = true

    root.node.nodeValue = value
    this.execute('DOM.characterDataModified', { nodeId, value })
    return {}
}

/**
 * Enables console to refer to the node with given id via $x (see Command Line API for more
 * details $x functions).
 * ToDo: NYI
 *
 * @param  {NodeId} nodeId   DOM node id to be accessible by means of $x command line API.
 */
export function setInspectedNode ({ nodeId }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        return
    }

    inspectedNodes.unshift(root.node)

    if (inspectedNodes.length > 4) {
        inspectedNodes.pop()
    }

    /**
     * for some reasons Webpack can't deal with having $ (surrounded by single quotes) in
     * interpreted code that is why we ignore eslint in that line
     */
    inspectedNodes.forEach((elem, i) => (window["$" + i] = elem)) // eslint-disable-line quotes

    return {}
}

/**
 * Sets attributes on element with given id. This method is useful when user edits some existing attribute
 * value and types in several attribute name/value pairs.
 *
 * @param {NodeId} nodeId  Id of the element to set attributes for.
 * @param {String} name    Text with a number of attributes. Will parse this text using HTML parser.
 * @param {String} text    Attribute name to replace with new attributes derived from text in case text
 *                         parsed successfully.
 */
export function setAttributesAsText ({ nodeId, name, text }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    /**
     * create a fake element and apply the attribute string to a sub element
     * so that the browser parses it and we can use the JS native API to
     * access their values
     */
    const fakeElem = document.createElement('div')
    const nodeName = root.node.nodeName
    fakeElem.innerHTML = `<${nodeName} ${text} />`

    if (name.trim()) {
        root.node.removeAttribute(name)
    }

    fakeElem.childNodes[0].attributes.toArray().forEach(
        (attr) => root.node.setAttribute(attr.name, attr.value))

    return {}
}

/**
 * Marks last undoable state. (EXPERIMENTAL)
 */
export function markUndoableState () {
    return {}
}

/**
 * Requests that the node is sent to the caller given the JavaScript node object reference.
 * All nodes that form the path from the node to the root are also sent to the client as a
 * series of setChildNodes notifications.
 * @return {Runtime.RemoteObjectId}  object id where node is stored
 */
export function requestNode ({ objectId }) {
    const node = ObjectStore.getByObjectId(objectId)
    const root = new Node(node)

    this.execute('DOM.setChildNodes', {
        parentId: root.nodeId,
        nodes: root.children
    })

    return { nodeId: root.nodeId }
}

/**
 * Resolves JavaScript node object for given node id.
 *
 * @param {NodeId} nodeId          Id of the node to resolve.
 * @param {String} objectGroup     Symbolic group name that can be used to release multiple objects.
 * @return {Runtime.RemoteObject}  JavaScript object wrapper for given node.
 */
export function resolveNode ({ nodeId }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    const nodeProperty = new PropertyObject(root.node)
    const { className, description, objectId, subtype, type } = nodeProperty
    return { object: { className, description, objectId, subtype, type } }
}

/**
 * Returns attributes for the specified node.
 * @param  {nodeId}   nodeId  Id of the node to retrieve attibutes for.
 * @return {String[]}         An interleaved array of node attribute names and values.
 */
export function getAttributes ({ nodeId }) {
    const root = Node.getNode(nodeId)

    if (!root) {
        throw new Error(`Couldn't find node with nodeId ${nodeId}`)
    }

    return { attributes: _getAttributes(root.node.attributes) }
}

/**
 * Events
 */

/**
 * Fired when Document has been totally updated. Node ids are no longer valid.
 */
export function documentUpdated () {
    this.execute('DOM.documentUpdated', {})
}

export { enabled, name, HIGHLIGHT_NODE_ID }
