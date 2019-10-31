import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';

export const homePath: string = '';
export const chatPath: string = 'simple-chat';

const routes: Routes = [
    { path: chatPath, component: ChatComponent }
];

@NgModule({
    imports: [RouterModule.forRoot(
        routes
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
