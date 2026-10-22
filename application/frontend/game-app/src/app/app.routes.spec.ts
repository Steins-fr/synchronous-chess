import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { ChatPage } from '@app/modules/chat-page/chat.page';
import { SynchronousChess } from '@app/modules/chess/pages/synchronous-chess/synchronous-chess';
import { HomePage } from '@app/modules/home-page/home.page';
import { SeventeenPoker } from '@app/modules/seventeen-poker/pages/seventeen-poker/seventeen-poker';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { translationScopesGuard } from '@app/services/language/translation-scopes.guard';
import { describe, expect, test } from 'vitest';
import { chatPath, chessPath, homePath, pokerPath, routes } from './app.routes';

describe('routes', () => {
    async function loadedComponent(path: string): Promise<unknown> {
        const route: Route | undefined = routes.find((candidate: Route) => candidate.path === path);
        return route?.loadComponent?.();
    }

    test.each<[string, unknown]>([
        [homePath, undefined],
        [chessPath, [translationScopesGuard]],
        [chatPath, [translationScopesGuard]],
        [pokerPath, [translationScopesGuard]],
    ])('the route \'%s\' should show once the translations of its games are loaded, without waiting for the APIs', (path: string, guards: unknown) => {
        expect(routes.find((candidate: Route) => candidate.path === path)?.canActivate).toEqual(guards);
    });

    test.each<[string, unknown]>([
        [homePath, undefined],
        [chessPath, [provideTranslocoScope(TranslationScope.CHESS, TranslationScope.CHAT)]],
        [chatPath, [provideTranslocoScope(TranslationScope.CHAT)]],
        [pokerPath, [provideTranslocoScope(TranslationScope.POKER, TranslationScope.CHAT)]],
    ])('the route \'%s\' should provide the translations of the games it holds', (path: string, providers: unknown) => {
        expect(routes.find((candidate: Route) => candidate.path === path)?.providers).toEqual(providers);
    });

    test.each<[string, Type<unknown>]>([
        [homePath, HomePage],
        [chessPath, SynchronousChess],
        [chatPath, ChatPage],
        [pokerPath, SeventeenPoker],
    ])('the route \'%s\' should load its page on demand', async (path: string, page: Type<unknown>) => {
        // When
        const component: unknown = await loadedComponent(path);

        // Then
        expect(component).toBe(page);
    });
});
