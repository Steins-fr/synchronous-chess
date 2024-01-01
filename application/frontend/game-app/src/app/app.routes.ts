import { Routes } from '@angular/router';
import { ChatPage } from '@app/pages/chat-page/chat.page';
import { SynchronousChessPage } from '@app/pages/synchronous-chess-page/synchronous-chess.page';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

export const routes: Routes = [
    { path: homePath, component: SynchronousChessPage },
    { path: chatPath, component: ChatPage }
];
