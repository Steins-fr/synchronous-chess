import { Routes } from '@angular/router';
import { ChatPage } from '@app/modules/chat-page/chat.page';
import { SynchronousChess } from '@app/modules/chess/pages/synchronous-chess/synchronous-chess';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

export const routes: Routes = [
    { path: homePath, component: SynchronousChess },
    { path: chatPath, component: ChatPage }
];
