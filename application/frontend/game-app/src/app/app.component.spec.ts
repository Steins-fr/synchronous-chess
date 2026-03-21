import { TestBed, ComponentFixture } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { describe, test, expect, beforeEach } from 'vitest';

describe('AppComponent', () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AppComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    test('should create the app', () => {
        expect(component).toBeTruthy();
    });

    test('should have as title \'synchronous-chess\'', () => {
        expect(component['title']).toEqual('synchronous-chess');
    });

    test('should render title', () => {
        fixture.detectChanges();
        const compiled = fixture.nativeElement;
        expect(compiled.querySelector('nav').textContent).not.toContain('synchronous-chess app is running!');
    });
});
