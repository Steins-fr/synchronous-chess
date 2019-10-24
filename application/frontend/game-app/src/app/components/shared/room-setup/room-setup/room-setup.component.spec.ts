import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomSetupComponent } from './room-setup.component';
import { FormsModule } from '@angular/forms';

describe('RoomSetupComponent', () => {
    let component: RoomSetupComponent;
    let fixture: ComponentFixture<RoomSetupComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [RoomSetupComponent],
            imports: [
                FormsModule
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(RoomSetupComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
