/**
 * Custom Webdriver domain
 */

/**
 * Return page infos
 */
export function info () {
    const { uuid, hostname, url, title, description, metadata } = this
    return { uuid, hostname, url, title, description, metadata }
}
