/** A response of the access lambda: API Gateway sends each cookie in a Set-Cookie header of its own */
export interface AccessResponse {
    statusCode: number;
    headers: Record<string, string>;
    cookies?: string[];
    body?: string;
}

/** A page of text, never cached: what the login answers when it refuses */
export function textResponse(statusCode: number, body: string): AccessResponse {
    return { statusCode, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body };
}

/** A redirection setting cookies, never cached, which tells the next page nothing of the login (the code in its URL) */
export function redirection(location: string, cookies: string[]): AccessResponse {
    return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }, cookies };
}
