import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { leaveMatchGuard } from '@app/modules/room-layout/leave-match.guard';
import { translationScopesGuard } from '@app/services/language/translation-scopes.guard';

export const homePath: string = '';
export const chessPath: string = 'synchronous-chess';
export const chatPath: string = 'simple-chat';
export const pokerPath: string = 'seventeen-poker';
export const roulettePath: string = 'russian-roulette';

// The pages are loaded on their first visit, each in a chunk of its own: the initial bundle only holds the shell of the
// app (the navigation, the theme). The pages of the games show once their translations are loaded (TranslationScope):
// the chess, poker and roulette pages hold the chat, the poker page the names of the cards. The scopes are written as literals,
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
];
