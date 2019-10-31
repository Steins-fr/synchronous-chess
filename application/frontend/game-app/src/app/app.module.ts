import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { WebrtcStatesComponent } from './components/shared/debug/webrtc-states/webrtc-states.component';
import { ChatComponent } from './components/chat/chat.component';
import { RoomService } from './services/room/room.service';
import { RoomSetupComponent } from './components/shared/room-setup/room-setup/room-setup.component';
import { WebrtcDebugComponent } from './components/shared/debug/webrtc-debug/webrtc-debug.component';
import { RoomApiService } from './services/room-api/room-api.service';
import { WebSocketService } from './services/web-socket/web-socket.service';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';

import { ScrollingModule } from '@angular/cdk/scrolling';

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
        AppRoutingModule,
        BrowserAnimationsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        ScrollingModule
    ],
    providers: [RoomService, RoomApiService, WebSocketService],
    bootstrap: [AppComponent]
})
export class AppModule { }
