import { Routes } from '@angular/router';
import { ChatPageComponent } from '@app/pages/chat-page/chat-page.component';
import { SynchronousChessPageComponent } from '@app/pages/synchronous-chess-page/synchronous-chess-page.component';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

export const routes: Routes = [
    { path: homePath, component: SynchronousChessPageComponent },
    { path: chatPath, component: ChatPageComponent }
];
