import { describe, expect, test } from 'vitest';
import { parseCookies, serializeCookie } from './cookie.helper';

describe('cookie helper', () => {
    test('should read the cookies of a Cookie header', () => {
        expect(parseCookies('a=1; b=2;c=3')).toEqual(new Map([['a', '1'], ['b', '2'], ['c', '3']]));
    });

    test('should read the cookies of an event of the HTTP API, one by item', () => {
        expect(parseCookies(['a=1', 'b=2'])).toEqual(new Map([['a', '1'], ['b', '2']]));
    });

    test('should keep a value as sent: its = and its encoding', () => {
        expect(parseCookies('policy=eyJ9_; signature=a%3Db==')).toEqual(new Map([['policy', 'eyJ9_'], ['signature', 'a%3Db==']]));
    });

    test('should keep the first cookie of a name, the most specific', () => {
        expect(parseCookies('a=host; a=domain')).toEqual(new Map([['a', 'host']]));
    });

    test('should ignore what is not a cookie', () => {
        expect(parseCookies('flag; =value; ; a=')).toEqual(new Map([['a', '']]));
    });

    test.each([
        ['no Cookie header', undefined],
        ['an empty header', ''],
        ['no cookie', []],
    ])('should read no cookie from %s', (_case: string, cookies: string | string[] | undefined) => {
        expect(parseCookies(cookies)).toEqual(new Map());
    });

    test('should set a cookie of the host, over HTTPS only, hidden from the scripts, sent by the navigations from another site', () => {
        expect(serializeCookie('login', 'state.verifier', { maxAge: 600 })).toEqual('login=state.verifier; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax');
    });

    test('should set a cookie of a domain, sent to its hosts', () => {
        expect(serializeCookie('access', 'value', { domain: 'steins.fr', maxAge: 60 })).toEqual('access=value; Domain=steins.fr; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Lax');
    });

    test('should delete a cookie', () => {
        expect(serializeCookie('login', '', { maxAge: 0 })).toEqual('login=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
    });
});
