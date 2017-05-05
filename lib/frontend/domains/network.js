import Cookies from 'js-cookie'

/**
 * Returns all browser cookies for the current URL. Depending on the backend support, will return detailed
 * cookie information in the cookies field. (EXPERIMENTAL)
 */
export function getCookies ({ urls }) {
    const cookies = Cookies.get()
    return Object.keys(cookies).map((name) => {
        return { name, value: cookies[name] }
    })
}

/**
 * Sets a cookie with the given cookie data; may overwrite equivalent cookies if they exist. (EXPERIMENTAL)
 * @param {String}         url            The request-URI to associate with the setting of the cookie. This
 *                                        value can affect the default domain and path values of the created cookie.
 * @param {String}         name           The name of the cookie.
 * @param {String}         value          The value of the cookie.
 * @param {String}         domain         If omitted, the cookie becomes a host-only cookie.
 * @param {String}         path           Defaults to the path portion of the url parameter.
 * @param {Boolean}        secure         Defaults ot false.
 * @param {Boolean}        httpOnly       Defaults ot false.
 * @param {CookieSameSite} sameSite       Defaults to browser default behavior.
 * @param {Timestamp}      expirationDate If omitted, the cookie becomes a session cookie.
 *
 * @return {Boolean}                      True if successfully set cookie.
 */
export function setCookie (cookie) {
    /**
     * make sure secure and httpOnly are boolean
     */
    cookie.secure = Boolean(cookie.secure)
    cookie.httpOnly = Boolean(cookie.httpOnly)
    cookie.expires = cookie.expirationDate

    /**
     * set cookie
     */
    const { domain, path, expires, secure, httpOnly } = cookie
    Cookies.set(cookie.name, cookie.value, { domain, path, expires, secure, httpOnly })
    return { success: true }
}

/**
 * Deletes browser cookie with given name, domain and path. (EXPERIMENTAL)
 * @param  {String} cookieName Name of the cookie to remove.
 * @param  {String} url        URL to match cooke domain and path.
 *
 * @return {Boolean}           True if successfully removed cookie.
 */
export function deleteCookie ({ cookieName, url }) {
    Cookies.remove(name)
    return { success: true }
}

/**
 * Clears browser cookies.
 *
 * @return {Boolean}           True if successfully removed cookies.
 */
export function clearBrowserCookies () {
    const cookies = Cookies.get()
    for (const cookie of Object.keys(cookies)) {
        Cookies.remove(cookie)
    }
    return { success: true }
}

export default {
    getAllCookie: getCookies // same functionality
}
