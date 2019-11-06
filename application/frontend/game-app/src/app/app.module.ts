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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { ParticipantComponent } from './components/chat/participant/participant.component';
import { ChessBoardComponent } from './components/chess-board/chess-board.component';
import { MatGridListModule } from '@angular/material/grid-list';
import { RangePipe } from './pipes/range.pipe';
import { PieceComponent } from './components/chess-board/piece/piece.component';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { Vector2dPipe } from './pipes/vector2d.pipe';


@NgModule({
    declarations: [
        AppComponent,
        WebrtcStatesComponent,
        ChatComponent,
        RoomSetupComponent,
        WebrtcDebugComponent,
        ParticipantComponent,
        ChessBoardComponent,
        RangePipe,
        PieceComponent,
        Vector2dPipe
    ],
    imports: [
        BrowserModule,
        FormsModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        ScrollingModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        MatGridListModule,
        DragDropModule
    ],
    providers: [RoomService, RoomApiService, WebSocketService],
    bootstrap: [AppComponent]
})
export class AppModule { }
