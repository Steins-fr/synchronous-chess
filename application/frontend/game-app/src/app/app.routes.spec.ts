import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { BidPoker } from '@app/modules/bid-poker/pages/bid-poker/bid-poker';
import { ChatPage } from '@app/modules/chat-page/chat.page';
import { Contraband } from '@app/modules/contraband/pages/contraband/contraband';
import { GardenOfEden } from '@app/modules/garden-of-eden/pages/garden-of-eden/garden-of-eden';
import { SynchronousChess } from '@app/modules/chess/pages/synchronous-chess/synchronous-chess';
import { HomePage } from '@app/modules/home-page/home.page';
import { MinorityGame } from '@app/modules/minority-game/pages/minority-game/minority-game';
import { RussianRoulette } from '@app/modules/russian-roulette/pages/russian-roulette/russian-roulette';
import { SeventeenPoker } from '@app/modules/seventeen-poker/pages/seventeen-poker/seventeen-poker';
import { SoundLabPage } from '@app/modules/sound-lab/sound-lab.page';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { leaveMatchGuard } from '@app/modules/room-layout/leave-match.guard';
import { translationScopesGuard } from '@app/services/language/translation-scopes.guard';
import { describe, expect, test } from 'vitest';
import { bidPokerPath, chatPath, chessPath, contrabandPath, gardenOfEdenPath, homePath, minorityGamePath, pokerPath, roulettePath, routes, soundLabPath } from './app.routes';

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
        [roulettePath, [translationScopesGuard]],
        [bidPokerPath, [translationScopesGuard]],
        [minorityGamePath, [translationScopesGuard]],
        [contrabandPath, [translationScopesGuard]],
        [gardenOfEdenPath, [translationScopesGuard]],
        [soundLabPath, undefined],
    ])('the route \'%s\' should show once the translations of its games are loaded, without waiting for the APIs', (path: string, guards: unknown) => {
        expect(routes.find((candidate: Route) => candidate.path === path)?.canActivate).toEqual(guards);
    });

    test.each<[string, unknown]>([
        [homePath, undefined],
        [chessPath, [leaveMatchGuard]],
        [chatPath, undefined],
        [pokerPath, [leaveMatchGuard]],
        [roulettePath, [leaveMatchGuard]],
        [bidPokerPath, [leaveMatchGuard]],
        [minorityGamePath, [leaveMatchGuard]],
        [contrabandPath, [leaveMatchGuard]],
        [gardenOfEdenPath, [leaveMatchGuard]],
    ])('the route \'%s\' should ask to confirm leaving a match its player plays', (path: string, guards: unknown) => {
        expect(routes.find((candidate: Route) => candidate.path === path)?.canDeactivate).toEqual(guards);
    });

    test.each<[string, unknown]>([
        [homePath, undefined],
        [chessPath, [provideTranslocoScope(TranslationScope.CHESS, TranslationScope.CHAT)]],
        [chatPath, [provideTranslocoScope(TranslationScope.CHAT)]],
        [pokerPath, [provideTranslocoScope(TranslationScope.POKER, TranslationScope.CARDS, TranslationScope.CHAT)]],
        [roulettePath, [provideTranslocoScope(TranslationScope.ROULETTE, TranslationScope.CHAT)]],
        [bidPokerPath, [provideTranslocoScope(TranslationScope.BID, TranslationScope.CARDS, TranslationScope.CHAT)]],
        [minorityGamePath, [provideTranslocoScope(TranslationScope.MINORITY, TranslationScope.CHAT)]],
        [contrabandPath, [provideTranslocoScope(TranslationScope.CONTRABAND, TranslationScope.CHAT)]],
        [gardenOfEdenPath, [provideTranslocoScope(TranslationScope.EDEN, TranslationScope.CHAT)]],
        [soundLabPath, undefined],
    ])('the route \'%s\' should provide the translations of the games it holds', (path: string, providers: unknown) => {
        expect(routes.find((candidate: Route) => candidate.path === path)?.providers).toEqual(providers);
    });

    test.each<[string, Type<unknown>]>([
        [homePath, HomePage],
        [chessPath, SynchronousChess],
        [chatPath, ChatPage],
        [pokerPath, SeventeenPoker],
        [roulettePath, RussianRoulette],
        [bidPokerPath, BidPoker],
        [minorityGamePath, MinorityGame],
        [contrabandPath, Contraband],
        [gardenOfEdenPath, GardenOfEden],
        [soundLabPath, SoundLabPage],
    ])('the route \'%s\' should load its page on demand', async (path: string, page: Type<unknown>) => {
        // When
        const component: unknown = await loadedComponent(path);

        // Then
        expect(component).toBe(page);
    });
});
