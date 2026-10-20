import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { apiHealthGuard } from '@app/services/api-health/api-health.guard';
import { translationScopesGuard } from '@app/services/language/translation-scopes.guard';

export const homePath: string = '';
export const chessPath: string = 'synchronous-chess';
export const chatPath: string = 'simple-chat';

// The pages are loaded on their first visit, each in a chunk of its own: the initial bundle only holds the shell of the
// app (the navigation, the theme, and the check of the APIs). The pages using the APIs show once they are up, and once
// the translations of the games they hold are loaded (TranslationScope), both waited together: the chess page holds the
// chat. The scopes are written as literals, for the keys manager to find them
export const routes: Routes = [
    {
        path: homePath,
        loadComponent: () => import('@app/modules/home-page/home.page').then((page) => page.HomePage),
    },
    {
        path: chessPath,
        canActivate: [apiHealthGuard, translationScopesGuard],
        providers: [provideTranslocoScope('chess', 'chat')],
        loadComponent: () => import('@app/modules/chess/pages/synchronous-chess/synchronous-chess')
            .then((page) => page.SynchronousChess),
    },
    {
        path: chatPath,
        canActivate: [apiHealthGuard, translationScopesGuard],
        providers: [provideTranslocoScope('chat')],
        loadComponent: () => import('@app/modules/chat-page/chat.page').then((page) => page.ChatPage),
    },
];
