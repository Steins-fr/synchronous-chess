import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { ChatPage } from '@app/modules/chat-page/chat.page';
import { SynchronousChess } from '@app/modules/chess/pages/synchronous-chess/synchronous-chess';
import { HomePage } from '@app/modules/home-page/home.page';
import { apiHealthGuard } from '@app/services/api-health/api-health.guard';
import { describe, expect, test } from 'vitest';
import { chatPath, chessPath, homePath, routes } from './app.routes';

describe('routes', () => {
    async function loadedComponent(path: string): Promise<unknown> {
        const route: Route | undefined = routes.find((candidate: Route) => candidate.path === path);
        return route?.loadComponent?.();
    }

    test.each<[string, unknown]>([
        [homePath, undefined],
        [chessPath, [apiHealthGuard]],
        [chatPath, [apiHealthGuard]],
    ])('the route \'%s\' should show once the APIs it uses are up', (path: string, guards: unknown) => {
        expect(routes.find((candidate: Route) => candidate.path === path)?.canActivate).toEqual(guards);
    });

    test.each<[string, Type<unknown>]>([
        [homePath, HomePage],
        [chessPath, SynchronousChess],
        [chatPath, ChatPage],
    ])('the route \'%s\' should load its page on demand', async (path: string, page: Type<unknown>) => {
        // When
        const component: unknown = await loadedComponent(path);

        // Then
        expect(component).toBe(page);
    });
});
