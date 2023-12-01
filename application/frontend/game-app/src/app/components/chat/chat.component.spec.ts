import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomServiceMessage } from '@app/classes/webrtc/messages/room-service-message';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';

import { ChatComponent, ChatMessageType } from './chat.component';
import { FormsModule } from '@angular/forms';
import { RoomSetupComponent } from '../shared/room-setup/room-setup.component';
import { WebrtcDebugComponent } from '../shared/debug/webrtc-debug/webrtc-debug.component';
import { WebrtcStatesComponent } from '../shared/debug/webrtc-states/webrtc-states.component';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { ParticipantComponent } from './participant/participant.component';
import { RoomService } from '@app/services/room/room.service';
import Notifier from '@app/classes/notifier/notifier';

describe('ChatComponent', () => {
    let component: ChatComponent;
    let fixture: ComponentFixture<ChatComponent>;
    let roomServiceSpy: jasmine.SpyObj<BlockRoomService<RoomServiceMessage<ChatMessageType, string>>>;

    beforeEach(async () => {
        roomServiceSpy = jasmine.createSpyObj<BlockRoomService<RoomServiceMessage<ChatMessageType, string>>>(
            ['isReady', 'notifier', 'clear', 'players']
        );

        const notifierSpy: jasmine.SpyObj<Notifier<any, any>> = jasmine.createSpyObj<Notifier<any, any>>(['follow', 'unfollow']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: notifierSpy,
            writable: false
        });
        Object.defineProperty(roomServiceSpy, 'players', {
            value: new Map(),
            writable: false
        });

        await TestBed.configureTestingModule({
            providers: [
                { provide: RoomService, useValue: roomServiceSpy }
            ],
            declarations: [
                ChatComponent,
                WebrtcDebugComponent,
                WebrtcStatesComponent,
                RoomSetupComponent,
                ParticipantComponent
            ],
            imports: [
                FormsModule,
                BrowserAnimationsModule,
                ScrollingModule,
                MatFormFieldModule,
                MatInputModule,
                MatButtonModule,
                MatProgressSpinnerModule,
                MatChipsModule
            ]
        })
            .compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(ChatComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
