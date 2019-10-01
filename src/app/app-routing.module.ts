import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DualChatComponent } from './components/example/dual-chat/dual-chat.component';

export const homePath: string = '';
export const dualChatPath: string = 'dual-chat';

const routes: Routes = [{ path: dualChatPath, component: DualChatComponent }];

@NgModule({
    imports: [RouterModule.forRoot(
        routes,
        { enableTracing: true } // <-- debugging purposes only
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
