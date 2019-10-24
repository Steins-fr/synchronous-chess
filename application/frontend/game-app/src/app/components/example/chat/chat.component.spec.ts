import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatComponent } from './chat.component';
import { WebrtcStatesComponent } from '../../shared/debug/webrtc-states/webrtc-states.component';
import { IcecandidatesComponent } from '../../shared/debug/icecandidates/icecandidates.component';
import { FormsModule } from '@angular/forms';
import { RoomSetupComponent } from '../../shared/room-setup/room-setup/room-setup.component';

describe('ChatComponent', () => {
    let component: ChatComponent;
    let fixture: ComponentFixture<ChatComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                ChatComponent,
                WebrtcStatesComponent,
                IcecandidatesComponent,
                RoomSetupComponent
            ],
            imports: [
                FormsModule
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(ChatComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
