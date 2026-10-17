/**
 * A text from the network: a string of `minLength` to `maxLength` characters, without the NUL character, which
 * PostgreSQL refuses in a text
 */
export function isText(value: unknown, maxLength: number, minLength: number = 1): value is string {
    return typeof value === 'string' && value.length >= minLength && value.length <= maxLength && !value.includes('\u0000');
}

/**
 * The name of a room or of a player, from the network: a text, not longer than the protocol allows, and not of spaces
 * only, the search key of the name of a room (search.helper) being the key of an index
 */
export function isName(value: unknown, maxLength: number): value is string {
    return isText(value, maxLength) && value.trim() !== '';
}
