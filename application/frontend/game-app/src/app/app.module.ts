import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { WebrtcStatesComponent } from './components/shared/debug/webrtc-states/webrtc-states.component';
import { ChatComponent } from './components/example/chat/chat.component';
import { RoomService } from './services/room/room.service';
import { RoomSetupComponent } from './components/shared/room-setup/room-setup/room-setup.component';
import { WebrtcDebugComponent } from './components/shared/debug/webrtc-debug/webrtc-debug.component';

@NgModule({
    declarations: [
        AppComponent,
        WebrtcStatesComponent,
        ChatComponent,
        RoomSetupComponent,
        WebrtcDebugComponent
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
