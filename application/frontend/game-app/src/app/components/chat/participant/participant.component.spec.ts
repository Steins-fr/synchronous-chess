import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantComponent } from './participant.component';
import { MatChipsModule } from '@angular/material/chips';
import { Player } from 'src/app/classes/player/player';

describe('ParticipantComponent', () => {
    let component: ParticipantComponent;
    let fixture: ComponentFixture<ParticipantComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [ParticipantComponent],
            imports: [MatChipsModule]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(ParticipantComponent);
        component = fixture.componentInstance;
        component.player = new Player('');
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
