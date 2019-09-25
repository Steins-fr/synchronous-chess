import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { PureWebrtcComponent } from './components/pure-webrtc/pure-webrtc.component';
import { CreateComponent } from './components/pure-webrtc/create/create.component';
import { JoinComponent } from './components/pure-webrtc/join/join.component';
import { IcecandidatesComponent } from './components/shared/debug/icecandidates/icecandidates.component';
import { WebrtcStatesComponent } from './components/shared/debug/webrtc-states/webrtc-states.component';

@NgModule({
    declarations: [
        AppComponent,
        PureWebrtcComponent,
        CreateComponent,
        JoinComponent,
        IcecandidatesComponent,
        WebrtcStatesComponent
    ],
    imports: [
        BrowserModule,
        FormsModule,
        AppRoutingModule
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }
