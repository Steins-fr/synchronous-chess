import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { PureWebrtcComponent } from './components/pure-webrtc/pure-webrtc.component';

export const homePath: string = '';
export const pureWebrtcPath: string = 'pure-webrtc';

const routes: Routes = [{ path: pureWebrtcPath, component: PureWebrtcComponent }];

@NgModule({
    imports: [RouterModule.forRoot(
        routes,
        { enableTracing: true } // <-- debugging purposes only
    )],
    exports: [RouterModule]
})
export class AppRoutingModule { }
