import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { RoomSetupComponent } from './room-setup.component';

describe('RoomSetupComponent', () => {
    let component: RoomSetupComponent;
    let fixture: ComponentFixture<RoomSetupComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [RoomSetupComponent],
            imports: [
                FormsModule,
                MatFormFieldModule,
                MatInputModule,
                MatButtonModule,
                MatProgressSpinnerModule,
                BrowserAnimationsModule
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(RoomSetupComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
