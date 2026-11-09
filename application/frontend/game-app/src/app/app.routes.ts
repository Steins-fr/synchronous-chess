import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { leaveMatchGuard } from '@app/modules/room-layout/leave-match.guard';
import { translationScopesGuard } from '@app/services/language/translation-scopes.guard';

export const homePath: string = '';
export const chessPath: string = 'synchronous-chess';
export const chatPath: string = 'simple-chat';
export const pokerPath: string = 'seventeen-poker';
export const roulettePath: string = 'russian-roulette';
export const bidPokerPath: string = 'bid-poker';
export const minorityGamePath: string = 'minority-game';
export const contrabandPath: string = 'contraband';
export const gardenOfEdenPath: string = 'garden-of-eden';
// Developer tooling, linked from nowhere: every sound of the games, to listen to them
export const soundLabPath: string = 'sound-lab';

// The pages are loaded on their first visit, each in a chunk of its own: the initial bundle only holds the shell of the
// app (the navigation, the theme). The pages of the games show once their translations are loaded (TranslationScope):
// the chess, poker, roulette, bid poker, minority game, contraband and garden of Eden pages hold the chat, the poker pages the names of the cards. The scopes are written as literals,
// for the keys manager to find them. None waits for the APIs: a page reaches them once a visitor acts on it
// (VisitorPresenceService), a bot rendering it never wakes the paused database. Leaving the page of a game while the
// player plays a match asks it to confirm, the other player waiting for it
export const routes: Routes = [
    {
        path: homePath,
        loadComponent: () => import('@app/modules/home-page/home.page').then((page) => page.HomePage),
    },
    {
        path: chessPath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('chess', 'chat')],
        loadComponent: () => import('@app/modules/chess/pages/synchronous-chess/synchronous-chess')
            .then((page) => page.SynchronousChess),
    },
    {
        path: chatPath,
        canActivate: [translationScopesGuard],
        providers: [provideTranslocoScope('chat')],
        loadComponent: () => import('@app/modules/chat-page/chat.page').then((page) => page.ChatPage),
    },
    {
        path: pokerPath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('poker', 'cards', 'chat')],
        loadComponent: () => import('@app/modules/seventeen-poker/pages/seventeen-poker/seventeen-poker')
            .then((page) => page.SeventeenPoker),
    },
    {
        path: roulettePath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('roulette', 'chat')],
        loadComponent: () => import('@app/modules/russian-roulette/pages/russian-roulette/russian-roulette')
            .then((page) => page.RussianRoulette),
    },
    {
        path: bidPokerPath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('bid', 'cards', 'chat')],
        loadComponent: () => import('@app/modules/bid-poker/pages/bid-poker/bid-poker').then((page) => page.BidPoker),
    },
    {
        path: minorityGamePath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('minority', 'chat')],
        loadComponent: () => import('@app/modules/minority-game/pages/minority-game/minority-game').then((page) => page.MinorityGame),
    },
    {
        path: contrabandPath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('contraband', 'chat')],
        loadComponent: () => import('@app/modules/contraband/pages/contraband/contraband').then((page) => page.Contraband),
    },
    {
        path: gardenOfEdenPath,
        canActivate: [translationScopesGuard],
        canDeactivate: [leaveMatchGuard],
        providers: [provideTranslocoScope('eden', 'chat')],
        loadComponent: () => import('@app/modules/garden-of-eden/pages/garden-of-eden/garden-of-eden').then((page) => page.GardenOfEden),
    },
    {
        path: soundLabPath,
        loadComponent: () => import('@app/modules/sound-lab/sound-lab.page').then((page) => page.SoundLabPage),
    },
];
