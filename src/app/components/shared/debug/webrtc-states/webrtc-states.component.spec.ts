import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { WebrtcStatesComponent } from './webrtc-states.component';

describe('WebrtcStatesComponent', () => {
    let component: WebrtcStatesComponent;
    let fixture: ComponentFixture<WebrtcStatesComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [WebrtcStatesComponent]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(WebrtcStatesComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
