import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { translationScopesGuard } from '@app/services/language/translation-scopes.guard';

export const homePath: string = '';
export const chessPath: string = 'synchronous-chess';
export const chatPath: string = 'simple-chat';
export const pokerPath: string = 'seventeen-poker';

// The pages are loaded on their first visit, each in a chunk of its own: the initial bundle only holds the shell of the
// app (the navigation, the theme). The pages of the games show once their translations are loaded (TranslationScope):
// the chess and poker pages hold the chat. The scopes are written as literals, for the keys manager to find them. None waits for
// the APIs: a page reaches them once a visitor acts on it (VisitorPresenceService), a bot rendering it never wakes the
// paused database
export const routes: Routes = [
    {
        path: homePath,
        loadComponent: () => import('@app/modules/home-page/home.page').then((page) => page.HomePage),
    },
    {
        path: chessPath,
        canActivate: [translationScopesGuard],
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
        providers: [provideTranslocoScope('poker', 'chat')],
        loadComponent: () => import('@app/modules/seventeen-poker/pages/seventeen-poker/seventeen-poker')
            .then((page) => page.SeventeenPoker),
    },
];
