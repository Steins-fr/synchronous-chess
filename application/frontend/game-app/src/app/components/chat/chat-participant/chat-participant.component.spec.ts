import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatParticipantComponent } from './chat-participant.component';
import { MatChipsModule } from '@angular/material/chips';
import { Player, PlayerType } from '@app/classes/player/player';

describe('ParticipantComponent', () => {
    let component: ChatParticipantComponent;
    let fixture: ComponentFixture<ChatParticipantComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ChatParticipantComponent],
            imports: [MatChipsModule]
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(ChatParticipantComponent);
        component = fixture.componentInstance;
        component.player = new Player('', PlayerType.HOST);
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
