/** The name of a room or of a player, from the network: a text, neither empty nor longer than the protocol allows */
export function isName(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
