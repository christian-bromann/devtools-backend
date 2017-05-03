/**
 * Events
 */

/**
 * Issued when a possible inspection target is created.
 * @param  {String} uuid  page target passed in by debugger service
 * @return {Object}       target info
 */
export function targetCreated () {
    const { uuid: targetId, title, url } = this
    this.send({
        method: 'Target.targetCreated',
        params: { targetInfo: { targetId, title, type: 'page', url } }
    })
}
