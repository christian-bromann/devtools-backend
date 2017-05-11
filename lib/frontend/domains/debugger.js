/**
 * Methods
 */

/**
 * Defines pause on exceptions state. Can be set to stop on all exceptions, uncaught exceptions
 * or no exceptions. Initial pause on exceptions state is `none`.
 *
 * @param  {String} state  Pause on exceptions mode. Allowed values: none, uncaught, all.
 */
export function setPauseOnExceptions () {
    return {}
}

/**
 * Enables or disables async call stacks tracking.
 *
 * @param  {Integer} maxDepth  Maximum depth of async call stacks. Setting to 0 will effectively
 *                             disable collecting async call stacks (default).
 */
export function setAsyncCallStackDepth () {
    return {}
}

/**
 * Replace previous blackbox patterns with passed ones. Forces backend to skip stepping/pausing
 * in scripts with url matching one of the patterns. VM will try to leave blackboxed script by
 * performing 'step in' several times, finally resorting to 'step out' if unsuccessful.
 *
 * @param  {String[]} patterns  Array of regexps that will be used to check script url for
 *                              blackbox state.
 */
export function setBlackboxPatterns () {
    return {}
}

export function getScriptSource ({ scriptId }) {
    const script = [].slice.apply(document.querySelectorAll('script')).filter(
        (node) => node._nodeId && scriptId === node._nodeId.toString())[0]

    if (!script) {
        return { scriptSource: '', error: `no script found with id ${scriptId}` }
    }

    /**
     * return script when inline
     */
    if (script.textContent.length) {
        return { scriptSource: script.textContent }
    }

    /**
     * otherwise return src and let middleware handle it
     */
    return { scriptSource: '', src: script.getAttribute('src') }
}

/**
 * Events
 */

/**
 * Fired when virtual machine parses script. This event is also fired for all known and
 * uncollected scripts upon enabling debugger.
 *
 * @param {String} script  script that was executed (e.g. by console)
 */
export function scriptParsed (script) {
    if (!script) {
        const scripts = document.querySelectorAll('script')

        for (const script of scripts) {
            const hasSourceURL = Boolean(script.attributes && script.attributes.src && script.attributes.src.nodeValue)
            this.execute('Debugger.scriptParsed', {
                startColumn: 0,
                startLine: 0,
                executionContextId: this.executionContextId,
                executionContextAuxData: {
                    frameId: this.frameId,
                    isDefault: true
                },
                hasSourceURL,
                isLiveEdit: false,
                scriptId: script._nodeId ? script._nodeId.toString() : null,
                sourceMapURL: '',
                url: hasSourceURL ? script.attributes.src.nodeValue : ''
            })
        }
        return
    }

    this.execute('Debugger.scriptParsed', {
        startColumn: 0,
        endColumn: 0,
        startLine: 0,
        endLine: 0,
        executionContextId: this.executionContextId,
        executionContextAuxData: {
            frameId: this.frameId,
            isDefault: true
        },
        scriptId: script.scriptId.toString(),
        hasSourceURL: false,
        isLiveEdit: false,
        sourceMapURL: '',
        url: ''
    })
}

/**
 * Fired when virtual machine fails to parse the script.
 */
export function scriptFailedToParse ({ scriptId, expression }) {
    this.execute('Debugger.scriptParsed', {
        startColumn: 0,
        endColumn: expression.length,
        startLine: 0,
        endLine: 0,
        executionContextId: this.executionContextId,
        executionContextAuxData: {
            frameId: this.frameId,
            isDefault: true
        },
        scriptId: scriptId.toString(),
        hasSourceURL: false,
        isLiveEdit: false,
        sourceMapURL: '',
        url: ''
    })
}
