import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebrtcStatesComponent } from '../webrtc-states/webrtc-states.component';

import { WebrtcDebugComponent } from './webrtc-debug.component';

describe('WebrtcDebugComponent', () => {
    let component: WebrtcDebugComponent;
    let fixture: ComponentFixture<WebrtcDebugComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [
                WebrtcDebugComponent,
                WebrtcStatesComponent
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(WebrtcDebugComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
