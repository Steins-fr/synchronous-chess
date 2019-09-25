import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { IcecandidatesComponent } from './icecandidates.component';

describe('IcecandidatesComponent', () => {
    let component: IcecandidatesComponent;
    let fixture: ComponentFixture<IcecandidatesComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [IcecandidatesComponent]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(IcecandidatesComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
