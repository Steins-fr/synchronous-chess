import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ChatPageComponent } from './pages/chat-page/chat-page.component';
import { SynchronousChessPageComponent } from './pages/synchronous-chess-page/synchronous-chess-page.component';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

const routes: Routes = [
    { path: homePath, component: SynchronousChessPageComponent },
    { path: chatPath, component: ChatPageComponent }
];

@NgModule({
    imports: [RouterModule.forRoot(
        routes
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
