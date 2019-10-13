import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DualChatComponent } from './components/example/dual-chat/dual-chat.component';
import { ChatComponent } from './components/example/chat/chat.component';

export const homePath: string = '';
export const dualChatPath: string = 'dual-chat';
export const simpleChatPath: string = 'simple-chat';

const routes: Routes = [
    { path: dualChatPath, component: DualChatComponent },
    { path: simpleChatPath, component: ChatComponent }
];

@NgModule({
    imports: [RouterModule.forRoot(
        routes
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
