import { Routes } from '@angular/router';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

// The pages are loaded on their first visit, each in a chunk of its own: the initial bundle only holds the shell of the
// app (the navigation and the theme)
export const routes: Routes = [
    {
        path: homePath,
        loadComponent: () => import('@app/modules/chess/pages/synchronous-chess/synchronous-chess')
            .then((page) => page.SynchronousChess),
    },
    {
        path: chatPath,
        loadComponent: () => import('@app/modules/chat-page/chat.page').then((page) => page.ChatPage),
    },
];
