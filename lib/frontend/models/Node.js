import { getAttributes } from '../utils/common'
import { HIGHLIGHT_NODE_ID } from '../domains/dom'
import { setNodeIds } from '../utils/dom'

let nodeCount = 0
let nodes = {}
let elements = {}

export default class Node {
    nodeId = nodeCount++

    constructor (node) {
        this.nodeId = node._nodeId
        this.childNodeCount = node.childNodes.length
        this.localName = node.localName || ''
        this.nodeName = node.nodeName
        this.nodeType = node.nodeType
        this.nodeValue = node.nodeValue || ''

        if (node.attributes) {
            this.attributes = Array.prototype.slice.call(node.attributes)
                .map((item) => [item.nodeName, item.nodeValue])
                .reduce((list, item) => list.concat(item), [])
        }

        if (this.isDocumentNode()) {
            this.documentURL = node.documentURI
            this.xmlVersion = node.xmlVersion
            this.baseURL = node.baseURI
        }

        if (this.isDoctypeDeclaration()) {
            this.publicId = node.publicId
            this.systemId = node.systemId
        }

        /**
         * register mutation observer if available
         */
        if (typeof MutationObserver === 'function') {
            this.registerMutationObserver(node)
        }

        nodes[this.nodeId] = this
        elements[this.nodeId] = node
    }

    handleAttributeChange (mutation) {
        const attribute = mutation.target.attributes.getNamedItem(mutation.attributeName)
        const attributeValue = (attribute || {}).value

        /**
         * attribute modified
         */
        if (mutation.oldValue && attributeValue) {
            return window.remoteDebugger.execute('DOM.attributeModified', {
                nodeId: this.nodeId,
                name: mutation.attributeName,
                value: attributeValue
            })
        }

        /**
         * attribute removed
         */
        if (mutation.oldValue && !attributeValue) {
            window.remoteDebugger.execute('DOM.attributeRemoved', {
                nodeId: this.nodeId,
                name: mutation.attributeName
            })
        }

        /**
         * attribute added
         */
        if (!mutation.oldValue) {
            window.remoteDebugger.execute('DOM.attributeModified', {
                nodeId: this.nodeId,
                name: mutation.attributeName,
                value: attributeValue
            })
        }
    }

    handleCharacterDataMutations (mutation) {
        /**
         * update text node value
         */
        this.nodeValue = mutation.target.nodeValue || ''

        /**
         * don't resend update event if change was triggered by frontend
         */
        if (mutation.target._characterDataModified) {
            /**
             * enable update for future changes scripts
             */
            mutation.target._characterDataModified = false

            return
        }

        /**
         * don't send event if text hasn't changed
         */
        if (mutation.oldValue === mutation.target.nodeValue) {
            return
        }

        /**
         * remove node in devtools frontend
         */
        window.remoteDebugger.execute('DOM.childNodeRemoved', {
            nodeId: this.nodeId,
            parentNodeId: this.parentId
        })

        /**
         * add node in devtools frontend with new value
         */
        window.remoteDebugger.execute('DOM.childNodeInserted', {
            node: {
                localName: this.localName,
                nodeId: this.nodeId,
                nodeName: this.nodeName,
                nodeType: this.nodeType,
                nodeValue: this.nodeValue
            },
            parentNodeId: this.parentId,
            previousNodeId: 0
        })
    }

    handleChildListMutations (mutation) {
        if (mutation.addedNodes.length) {
            for (let i = 0; i < mutation.addedNodes.length; ++i) {
                /**
                 * prevent highlighted node from being displayed in the devtools
                 */
                if (mutation.addedNodes[i].id === HIGHLIGHT_NODE_ID) {
                    continue
                }

                setNodeIds(mutation.addedNodes[i])
                const node = new Node(mutation.addedNodes[i])

                /**
                 * in case node is the first child there is no previous element sibling
                 * so use the parent node
                 */
                let previousNode = node.node.previousElementSibling
                if (!previousNode) {
                    previousNode = node.node.parentElement
                }

                window.remoteDebugger.execute('DOM.childNodeInserted', {
                    node: {
                        attributes: node.getFlattenedAttributes(),
                        childNodeCount: node.childNodeCount,
                        localName: node.localName,
                        nodeId: node.nodeId,
                        nodeName: node.nodeName,
                        nodeType: node.nodeType,
                        nodeValue: node.nodeValue
                    },
                    parentNodeId: this.nodeId,
                    previousNodeId: previousNode._nodeId
                })
            }
        }

        if (mutation.removedNodes.length) {
            for (let i = 0; i < mutation.removedNodes.length; ++i) {
                /**
                 * event not need to be thrown for highlighted node
                 */
                if (mutation.removedNodes[i].id === HIGHLIGHT_NODE_ID) {
                    continue
                }

                const node = mutation.removedNodes[i]
                window.remoteDebugger.execute('DOM.childNodeRemoved', {
                    nodeId: node._nodeId,
                    parentNodeId: this.nodeId
                })
            }
        }
    }

    isDocumentNode () {
        return this.nodeName === '#document'
    }

    isDoctypeDeclaration () {
        return this.nodeName === 'html'
    }

    getFlattenedAttributes () {
        return getAttributes(this.node.attributes)
    }

    addChild (node) {
        if (!this.children) {
            this.children = []
        }

        /**
         * check if node is injected script tag
         */
        if (node.nodeName.toLowerCase() === 'script' && node.getAttribute('data-origin') === 'debugger') {
            return
        }

        const child = new Node(node)
        child.parentId = this.nodeId
        this.children.push(child)
        return child
    }

    registerMutationObserver (node) {
        const observer = new MutationObserver((mutations) => {
            const attributeMutations = mutations.filter((m) => m.type === 'attributes')
            const childListMutations = mutations.filter((m) => m.type === 'childList')
            const characterDataMutations = mutations.filter((m) => m.type === 'characterData')
            attributeMutations.forEach(::this.handleAttributeChange)
            childListMutations.forEach(::this.handleChildListMutations)
            characterDataMutations.forEach(::this.handleCharacterDataMutations)
        })

        return observer.observe(node, {
            attributes: true,
            attributeOldValue: true,
            childList: true,
            characterData: true,
            characterDataOldValue: true
        })
    }

    get node () {
        return elements[this.nodeId]
    }

    static getNode (nodeId) {
        return nodes[nodeId]
    }
}
