import { epochSeconds } from '@helpers/time.helper';
import { accessCookies, stubAccessEnvironment } from '@testing/access';
import { anHttpAuthorizerEvent } from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import { handler } from './app';

describe('httpauthorizer lambda', () => {
    beforeEach(() => {
        stubAccessEnvironment();
    });

    test('should authorize the request sending the access cookies', async () => {
        expect(await handler(anHttpAuthorizerEvent(['theme=dark', ...accessCookies()]))).toEqual({ isAuthorized: true });
    });

    test.each([
        ['no cookie', undefined],
        ['other cookies', ['theme=dark']],
        ['expired access cookies', accessCookies(epochSeconds() - 1)],
    ])('should refuse the request sending %s', async (_case: string, cookies: string[] | undefined) => {
        expect(await handler(anHttpAuthorizerEvent(cookies))).toEqual({ isAuthorized: false });
    });
});
