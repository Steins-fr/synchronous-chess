import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DualChatComponent } from './dual-chat.component';
import { ChatComponent } from '../chat/chat.component';
import { WebrtcStatesComponent } from '../../shared/debug/webrtc-states/webrtc-states.component';
import { IcecandidatesComponent } from '../../shared/debug/icecandidates/icecandidates.component';
import { FormsModule } from '@angular/forms';

describe('DualChatComponent', () => {
    let component: DualChatComponent;
    let fixture: ComponentFixture<DualChatComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                DualChatComponent,
                ChatComponent,
                WebrtcStatesComponent,
                IcecandidatesComponent
            ],
            imports: [
                FormsModule
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(DualChatComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
