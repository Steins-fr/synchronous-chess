/** Where a cookie set by the API goes, besides its name and value */
export interface CookieAttributes {
    /** The parent domain sending the cookie to its hosts, the host setting it alone without */
    domain?: string;
    /** In seconds: 0 deletes the cookie */
    maxAge: number;
}

/**
 * The cookies a request sends, by name: the Cookie header of a websocket handshake (`a=1; b=2`), or the cookies of an
 * event of the HTTP API, one by item. The first of a name wins, the browser sending the most specific first. A value is
 * kept as sent, not decoded: the cookies of the API never encode theirs
 */
export function parseCookies(cookies: string | readonly string[] | undefined): ReadonlyMap<string, string> {
    const pairs: readonly string[] = typeof cookies === 'string' ? cookies.split(';') : cookies ?? [];
    const parsed: Map<string, string> = new Map<string, string>();

    for (const pair of pairs) {
        const separator: number = pair.indexOf('=');
        const name: string = separator < 0 ? '' : pair.slice(0, separator).trim();

        // Not a cookie without its name
        if (name !== '' && !parsed.has(name)) {
            parsed.set(name, pair.slice(separator + 1).trim());
        }
    }

    return parsed;
}

/**
 * A Set-Cookie of the API: sent over HTTPS only, never readable by the scripts of a page, and sent by the navigations to
 * its site, from another site too (Lax): the redirections of the login come back from Cognito
 */
export function serializeCookie(name: string, value: string, { domain, maxAge }: CookieAttributes): string {
    const scope: string = domain === undefined ? '' : `; Domain=${ domain }`;
    return `${ name }=${ value }${ scope }; Path=/; Max-Age=${ maxAge }; Secure; HttpOnly; SameSite=Lax`;
}
