import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { SyncChessGameComponent } from './components/sync-chess-game/sync-chess-game.component';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

const routes: Routes = [
    { path: homePath, component: SyncChessGameComponent },
    { path: chatPath, component: ChatComponent }
];

@NgModule({
    imports: [RouterModule.forRoot(
        routes
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
