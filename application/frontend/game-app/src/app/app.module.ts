import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { IcecandidatesComponent } from './components/shared/debug/icecandidates/icecandidates.component';
import { WebrtcStatesComponent } from './components/shared/debug/webrtc-states/webrtc-states.component';
import { ChatComponent } from './components/example/chat/chat.component';
import { RoomService } from './services/room/room.service';
import { RoomSetupComponent } from './components/shared/room-setup/room-setup/room-setup.component';

@NgModule({
    declarations: [
        AppComponent,
        IcecandidatesComponent,
        WebrtcStatesComponent,
        ChatComponent,
        RoomSetupComponent
    ],
    imports: [
        BrowserModule,
        FormsModule,
        AppRoutingModule
    ],
    providers: [RoomService],
    bootstrap: [AppComponent]
})
export class AppModule { }
