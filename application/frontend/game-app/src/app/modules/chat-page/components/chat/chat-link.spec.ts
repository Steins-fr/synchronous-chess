import { holdsLink } from './chat-link';
import { describe, expect, test } from 'vitest';

describe('holdsLink', () => {
    test.each([
        'see https://example.fr/page',
        'HTTP://EXAMPLE.FR',
        'ftp://files.example.fr',
        'go to www.example.fr',
        'write to alice@example.fr',
        'play on chess.com',
        'play on Chess.com',
        'join discord.gg/abc',
        'bit.ly/xyz',
        'my-site.io',
    ])('should find a link in %j', (text: string) => {
        expect(holdsLink(text)).toEqual(true);
    });

    test.each([
        'hello',
        'well played, see you at 5:30',
        'fini.Je reviens',
        'e.g. a knight',
        'ask @bob',
        'me @ home',
        'a@b.c',
        'a@b@c.fr',
        'a@.fr',
        'the com is down',
        'Ok.Net loss',
    ])('should find no link in %j', (text: string) => {
        expect(holdsLink(text)).toEqual(false);
    });
});
