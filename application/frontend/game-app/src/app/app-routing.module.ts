import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { ChessBoardComponent } from './components/chess-board/chess-board.component';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

const routes: Routes = [
    { path: homePath, component: ChessBoardComponent },
    { path: chatPath, component: ChatComponent }
];

@NgModule({
    imports: [RouterModule.forRoot(
        routes
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
