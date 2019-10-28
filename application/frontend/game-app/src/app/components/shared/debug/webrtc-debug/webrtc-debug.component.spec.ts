import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { WebrtcDebugComponent } from './webrtc-debug.component';
import { WebrtcStatesComponent } from '../webrtc-states/webrtc-states.component';

describe('WebrtcDebugComponent', () => {
    let component: WebrtcDebugComponent;
    let fixture: ComponentFixture<WebrtcDebugComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                WebrtcDebugComponent,
                WebrtcStatesComponent
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(WebrtcDebugComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
