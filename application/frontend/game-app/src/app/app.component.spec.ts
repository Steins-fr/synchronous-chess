import { TestBed, ComponentFixture } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ThemeModeEnum } from './services/theme/enums/theme-mode.enum';
import { ThemeService } from './services/theme/theme.service';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

describe('AppComponent', () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;

    function themeButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#theme-button');
    }

    beforeEach(async () => {
        localStorage.clear();

        await TestBed.configureTestingModule({
            imports: [AppComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    afterEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
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

    test('the theme button should tell the theme a click shows, and show it', async () => {
        // Then
        expect(themeButton().getAttribute('aria-label')).toBe('Passer au thème sombre');
        expect(themeButton().textContent.trim()).toBe('dark_mode');

        // When
        themeButton().click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(ThemeService).theme()).toBe(ThemeModeEnum.DARK);
        expect(themeButton().getAttribute('aria-label')).toBe('Passer au thème clair');
        expect(themeButton().title).toBe('Passer au thème clair');
        expect(themeButton().textContent.trim()).toBe('light_mode');

        // When
        themeButton().click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(ThemeService).theme()).toBe(ThemeModeEnum.LIGHT);
        expect(themeButton().getAttribute('aria-label')).toBe('Passer au thème sombre');
    });
});
