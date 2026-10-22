import { describe, expect, test } from 'vitest';
import { headerValue } from './header.helper';

describe('header helper', () => {
    test.each([
        ['as asked', { Origin: 'https://app.test' }],
        ['in lower case, as the HTTP API gives it', { origin: 'https://app.test' }],
        ['in another case', { ORIGIN: 'https://app.test' }],
    ])('should read a header named %s', (_case: string, headers: Record<string, string>) => {
        expect(headerValue(headers, 'Origin')).toEqual('https://app.test');
    });

    test.each([
        ['without the header', { Cookie: 'a=1' }],
        ['without headers', null],
        ['without the headers of an event', undefined],
    ])('should read nothing %s', (_case: string, headers: Record<string, string> | null | undefined) => {
        expect(headerValue(headers, 'Origin')).toBeUndefined();
    });
});
