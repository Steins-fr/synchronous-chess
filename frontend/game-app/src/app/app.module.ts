import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { IcecandidatesComponent } from './components/shared/debug/icecandidates/icecandidates.component';
import { WebrtcStatesComponent } from './components/shared/debug/webrtc-states/webrtc-states.component';
import { ChatComponent } from './components/example/chat/chat.component';
import { DualChatComponent } from './components/example/dual-chat/dual-chat.component';

@NgModule({
    declarations: [
        AppComponent,
        IcecandidatesComponent,
        WebrtcStatesComponent,
        ChatComponent,
        DualChatComponent
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
