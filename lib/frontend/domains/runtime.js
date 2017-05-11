import { scriptParsed } from './debugger'
import ObjectStore from '../models/ObjectStore'
import { getConsoleArg, getStacktrace, getFakeError, getObjectProperties, callFn } from '../utils/runtime'

export const scripts = []

/**
 * internal methods
 */

/**
 * overwrite console
 */
export function overwriteConsole (console) {
    let consoleMethods = Object.keys(Object.getPrototypeOf(console))

    /**
     * try different way to grab console methods
     * (more supported by newer browser)
     */
    if (consoleMethods.length === 0) {
        consoleMethods = Object.getOwnPropertyNames(console)
    }

    /**
     * if no methods were found return original object instead of null
     */
    if (consoleMethods.length === 0) {
        return console
    }

    return consoleMethods.reduce((con, type) => {
        if (typeof console[type] !== 'function') {
            con[type] = console[type]
            return con
        }

        const origFn = console[type].bind(console)
        const self = this
        con[type] = function __fakeConsole (...args) {
            self.execute('Runtime.consoleAPICalled', {
                args: args.map(getConsoleArg),
                executionContext: self.executionContextId,
                stackTrace: { callFrames: getStacktrace() },
                timestamp: (new Date()).getTime(),
                type
            })
            origFn.apply(self, args)
        }
        return con
    }, {})
}

/**
 * Methods
 */

/**
 * Tells inspected instance to run if it was waiting for debugger to attach.
 */
export function runIfWaitingForDebugger () {
    return {} // NYI
}

/**
 * Compiles expression.
 * @param  {String}           expression Expression to compile.
 * @param  {*}                context    scope to call expression on
 * @return {ScriptId}                    Id of the script.
 * @return {ExceptionDetails}            Exception details
 */
export function compileScript ({ expression }, context = window) {
    const { error, scriptId } = callFn.call(context, expression)

    if (error && error.wasThrown) {
        const exceptionDetails = {
            columnNumber: 0,
            exception: getConsoleArg(error, scriptId),
            exceptionId: scriptId,
            lineNumber: 0,
            scriptId: scriptId.toString(),
            text: 'Uncaught'
        }
        return { exceptionDetails }
    }

    scriptParsed.call(this, { scriptId })
    return { scriptId: scriptId.toString() }
}

/**
 * Evaluates expression on global object.
 *
 * @param  {Boolean}            awaitPromise          Whether execution should wait for promise to be
 *                                                    resolved. If the result of evaluation is not a
 *                                                    Promise, it's considered to be an error.
 * @param  {ExecutionContextId} contextId             Specifies in which execution context to perform
 *                                                    evaluation. If the parameter is omitted the
 *                                                    evaluation will be performed in the context of
 *                                                    the inspected page.
 * @param  {String}             expression            Expression to evaluate.
 * @param  {Boolean}            generatePreview       Whether preview should be generated for the result.
 * @param  {Boolean}            includeCommandLineAPI Determines whether Command Line API should be
 *                                                    available during the evaluation.
 * @param  {String}             objectGroup           Symbolic group name that can be used to release
 *                                                    multiple objects.
 * @param  {Boolean}            returnByValue         Whether the result is expected to be a JSON object
 *                                                    that should be sent by value.
 * @param  {Boolean}            silent                In silent mode exceptions thrown during evaluation
 *                                                    are not reported and do not pause execution.
 *                                                    Overrides setPauseOnException state.
 * @param  {Boolean}            userGesture           Whether execution should be treated as initiated
 *                                                    by user in the UI.
 * @return {RemoteObject|ExceptionDetails}                       Evauluation result or exception details
 */
export function evaluate ({
    awaitPromise, contextId, expression, generatePreview, includeCommandLineAPI,
    objectGroup, returnByValue, silent, userGesture
}) {
    /**
     * evaluate is only supported for console executions
     */
    if (['console', 'completion'].indexOf(objectGroup) === -1) {
        return {}
    }

    /**
     * If a variable gets assigned no compileScript method is triggered but `generatePreview`
     * will be passed into evaluate with true.
     * Also in case when `objectGroup` is set to completion we need to call compileScript
     * to return the result of the pass in function to get the preview for the scope.
     */
    if (generatePreview || objectGroup === 'completion') {
        compileScript.call(this, { expression })
    }

    const result = ObjectStore.getLastObject()
    const scriptId = ObjectStore.getLastScriptId()

    if (result instanceof Error && result.wasThrown) {
        const newError = getFakeError(result)
        const errorResult = getConsoleArg(newError, scriptId, returnByValue)

        return {
            result: errorResult,
            exceptionDetails: {
                columnNumber: 0,
                lineNumber: 0,
                scriptId: scriptId.toString(),
                exception: errorResult,
                exceptionId: scriptId,
                stackTrace: { callFrames: getStacktrace(newError) },
                text: newError.constructor.name
            }
        }
    }

    if (objectGroup === 'completion' && !returnByValue) {
        const constructorName = result && result.constructor ? result.constructor.name : undefined
        return {
            result: {
                className: constructorName,
                description: constructorName,
                objectId: JSON.stringify({ injectedScriptId: 1, id: scriptId }),
                type: typeof result
            }
        }
    }

    /**
     * in case evaluate throws an error or returns one we need to fake the stack
     * in order to not send debugger stacktraces
     */
    if (result instanceof Error) {
        return { result: getConsoleArg(getFakeError(result), scriptId, returnByValue) }
    }

    return { result: getConsoleArg(result, scriptId, returnByValue) }
}

/**
 * Calls function with given declaration on the given object. Object group of the result
 * is inherited from the target object.
 *
 * @param  {CallArgument[]}  arguments            Call arguments. All call arguments must belong
 *                                                to the same JavaScript world as the target object.
 * @param  {String}          functionDeclaration  Declaration of the function to call.
 * @return {RemoteObject}                         evelalutaion result
 * @return {ExceptionDetails}                     exception details
 */
export function callFunctionOn ({ arguments: args, functionDeclaration, objectId }) {
    const scope = ObjectStore.getByObjectId(objectId)

    compileScript.call(this, {
        expression: `(${functionDeclaration}).apply(this)`
    }, scope)

    const result = ObjectStore.getLastObject()
    const scriptId = ObjectStore.getLastScriptId()

    if (result instanceof Error) {
        return {
            exceptionDetails: {
                columnNumber: 0,
                lineNumber: 0,
                scriptId: scriptId.toString(),
                exception: result,
                exceptionId: scriptId,
                stackTrace: { callFrames: getStacktrace(result) },
                text: result.constructor.name
            }
        }
    }

    return { result: {
        type: typeof result,
        value: result
    } }
}

/**
 * Releases all remote objects that belong to a given group.
 *
 * @param  {String} objectGroup  Symbolic object group name.
 */
export function releaseObjectGroup ({ objectGroup }) {
    return {}
}

/**
 * Returns properties of a given object. Object group of the result is inherited from the
 * target object.
 *
 * @param  {RemoteObjectId} objectId                Identifier of the object to return properties for.
 * @param  {Boolean}        ownProperties           If true, returns properties belonging only to the
 *                                                 element itself, not to its prototype chain.
 * @param  {Boolean}        accessorPropertiesOnly  If true, returns accessor properties (with
 *                                                 getter/setter) only; internal properties are not
 *                                                 returned either.
 * @param  {Boolean}        generatePreview        Whether preview should be generated for the results.
 *
 * @return {RemoteObject}      evelalutaion result
 * @return {ExceptionDetails}  exception details
 */
export function getProperties ({ accessorPropertiesOnly, objectId }) {
    /**
     * not able to detect accessors via JS yet
     */
    if (accessorPropertiesOnly) {
        return { result: [] }
    }

    const result = ObjectStore.getByObjectId(objectId)

    if (!result) {
        return { result: [] }
    }

    return { result: getObjectProperties(result, true) }
}

/**
 * Releases remote object with given id.
 *
 * @param {RemoteObjectId} objectId  Identifier of the object to release.
 */
export function releaseObject ({ objectId }) {
    return {} // NYI
}

/**
 * Events
 */

/**
 * Issued when new execution context is created (e.g. when page load event gets triggered).
 *
 * @return {ExecutionContextDescription} A newly created execution contex.
 */
export function executionContextCreated () {
    this.execute('Runtime.executionContextCreated', {
        context: {
            auxData: {
                frameId: this.frameId,
                isDefault: true
            },
            id: this.executionContextId,
            name: document.title,
            origin: window.location.origin
        }
    })
}
