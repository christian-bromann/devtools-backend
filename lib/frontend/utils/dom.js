/**
 * parses through root children to create Node objects
 * @param  {NodeElement} root   element to start with
 * @param  {number}      depth  number of child depth to parse through
 * @param  {Object}      pierce unknown
 * @return {Node}               root element with children elements
 */
export function getDomNodes (root, depth, pierce) {
    for (let i = 0; i < root.node.childNodes.length; ++i) {
        const node = root.node.childNodes[i]

        /**
         * ignore line break nodes
         */
        if (node.nodeName === '#text' && node.nodeValue.trim() === '') {
            continue
        }

        /**
         * Check if node id is available and if not assign new node ids to them.
         * This can happen if a node was replaced or a text node changed between we
         * initially assigned a node id via `setNodeIds` and we created a node object
         * via `getDomNodes` (which have listeners for these changes)
         */
        if (typeof node._nodeId !== 'number') {
            setNodeIds(node)
        }

        const child = root.addChild(node)

        if (depth && child && node.childNodes.length) {
            getDomNodes(child, depth - 1, pierce)
            continue
        }

        /**
         * get child node if it is only a text node
         */
        if (child && node.childNodes.length === 1 && node.childNodes[0].nodeName === '#text') {
            getDomNodes(child, 0, pierce)
        }
    }
}

let nodes = 0
export function setNodeIds (root) {
    if (!root || root._nodeId) {
        return
    }

    root._nodeId = nodes++
    for (let i = 0; i < root.childNodes.length; ++i) {
        setNodeIds(root.childNodes[i])
    }
}

/**
 * parses rgba color object to css string
 * @param  {Object} color  object with r, g, b and a property
 * @return {String}        css value for e.g. background-color property
 */
export function getColorFormatted (color) {
    if (!color) {
        return `rgba(0, 0, 0, 0)`
    }
    return `rgba(${color.r},${color.g},${color.b},${color.a})`
}
