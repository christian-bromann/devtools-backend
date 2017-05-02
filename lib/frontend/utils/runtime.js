import ObjectStore from '../models/ObjectStore'
import { PropertyObject } from '../models/PropertyObject'

/**
 * parse console properties properly
 * @param  {*}             arg  any kind of primitive or object
 * @return {RemoteObject}       Mirror object referencing original JavaScript object.
 */
export function getConsoleArg (arg, scriptId = 1, returnByValue) {
    const property = new PropertyObject(arg)

    if (property.type === 'undefined') {
        return { type: property.type }
    }

    /**
     * return primitives right away
     */
    if (property.isPrimitive || (property.subtype === 'array' && returnByValue)) {
        return { type: property.type, value: arg }
    }

    const result = property.get()

    if (property.subtype !== 'node') {
        /**
         * apply preview for raw objects only
         */
        result.preview = {
            description: property.description,
            overflow: false,
            properties: getObjectProperties(property.object),
            type: property.type,
            subtype: property.subtype
        }
    }

    return result
}

export function getObjectProperties (obj, includeDescriptors = false) {
    return Object.getOwnPropertyNames(obj).map((propertyName) => {
        /**
         * ignore accessor and hide internal properties (_nodeId)
         */
        if (propertyName === 'length' || propertyName === 'constructor' || propertyName === '_nodeId') {
            return
        }

        const descriptor = Object.getOwnPropertyDescriptor(obj, propertyName)
        const property = new PropertyObject(descriptor.value)

        /**
         * only return a subset of properties
         */
        if (!includeDescriptors) {
            const result = property.get()
            result.name = propertyName
            result.value = result.description
            delete result.description
            delete result.objectId
            delete result.className
            return result
        }

        return {
            configurable: descriptor.configurable,
            enumerable: descriptor.enumerable,
            writable: descriptor.writable,
            name: propertyName,
            value: property.get(),
            isOwn: obj.hasOwnProperty(propertyName)
        }
    }).filter((prop) => Boolean(prop))
}

/**
 * generates an error object
 * @param  {String} [message='fake']  error message (optional)
 * @return {Object}                   error object
 */
export function getError (message = 'fake', fakeStack = false) {
    try {
        throw new Error(message)
    } catch (err) {
        /**
         * fake stack if none existing
         * TV browser doesn't allow to modify error object (readonly) so we need to
         * fake the error object
         */
        if (!err.stack || fakeStack) {
            return getFakeError(err)
        }

        return err
    }
}

/**
 * generates a fake error object since we can't modify the stack and eval errors come without
 */
export function getFakeError (err) {
    const newError = {
        message: err.message,
        stack: `${err.constructor.name}: ${err.message}\n\tat <anonymous>:1:1`
    }
    newError.constructor = err.constructor
    return newError
}

/**
 * returns stacktrace data for console.log event
 */
export function getStacktrace (err) {
    let error = err || getError()

    if (!error) {
        return []
    }

    const splittedStack = error.stack.split('\n')
    return splittedStack.filter((line) => {
        /**
         * filter out own functions
         */
        return !line.match(/^__(getStacktrace|fakeConsole)/)
    }).map((line) => {
        const stackData = line.trim().match(/^(.*@)*(.*):(\d+):(\d+)$/)

        if (!stackData) {
            return null
        }

        /**
         * ToDo assign _nodeId to each element on the page to get this working
         */
        const url = stackData[2]
        const script = Array.from(document.querySelectorAll('script')).filter((script) => {
            return script.src === url
        })[0]

        return {
            columnNumber: stackData[4],
            lineNumber: stackData[3],
            scriptId: script ? script._nodeId : 0,
            url: stackData[2],
            functionName: stackData[1] ? stackData[1].slice(0, 1) : ''
        }
    }).filter((stackData) => Boolean(stackData))
}

/**
 * executes a given expressions safely and returns its value or error
 * @param  {String} expression  javascript you want to execute
 * @return {Object}             result containing the expression value or error and objectId from store
 */
export function callFn (expression) {
    const result = { value: null, error: null, scriptId: null }

    try {
        result.value = eval(expression) // eslint-disable-line no-eval
    } catch (e) {
        result.error = e
        result.error.wasThrown = true

        /**
         * trigger scriptFailedToParse event when script can't be parsed
         */
        // scriptFailedToParse.call(this, script)
    } finally {
        result.scriptId = ObjectStore.push(result.value || result.error)
    }

    return result
}
