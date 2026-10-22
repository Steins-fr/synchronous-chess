import { TestBed, ComponentFixture, DeferBlockState } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { Language } from './services/language/enums/language.enum';
import { LanguageService } from './services/language/language.service';
import { ThemeModeEnum } from './services/theme/enums/theme-mode.enum';
import { ThemeService } from './services/theme/theme.service';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

describe('AppComponent', () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;

    function themeButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#theme-button');
    }

    function navTexts(): string[] {
        return [...fixture.nativeElement.querySelectorAll('nav a')].map((link: HTMLElement) => link.textContent.trim());
    }

    // The language menu, loaded once the app is idle: its placeholder before
    async function loadLanguageMenu(): Promise<void> {
        const [menu] = await fixture.getDeferBlocks();
        await menu.render(DeferBlockState.Complete);
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
        document.documentElement.removeAttribute('lang');
    });

    test('should create the app', () => {
        expect(component).toBeTruthy();
    });

    test('should have as title \'synchronous-chess\'', () => {
        expect(component['title']).toEqual('synchronous-chess');
    });

    test('should hold the loader of the pages, hidden until a navigation lasts', () => {
        expect(fixture.nativeElement.querySelector('app-page-loader output')?.textContent.trim()).toBe('');
    });

    test('should render title', () => {
        fixture.detectChanges();
        const compiled = fixture.nativeElement;
        expect(compiled.querySelector('nav').textContent).not.toContain('synchronous-chess app is running!');
    });

    test('the theme button should tell the theme a click shows, and show it', async () => {
        // Then
        expect(themeButton().getAttribute('aria-label')).toBe('Switch to the dark theme');
        expect(themeButton().textContent.trim()).toBe('dark_mode');

        // When
        themeButton().click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(ThemeService).theme()).toBe(ThemeModeEnum.DARK);
        expect(themeButton().getAttribute('aria-label')).toBe('Switch to the light theme');
        expect(themeButton().title).toBe('Switch to the light theme');
        expect(themeButton().textContent.trim()).toBe('light_mode');

        // When
        themeButton().click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(ThemeService).theme()).toBe(ThemeModeEnum.LIGHT);
        expect(themeButton().getAttribute('aria-label')).toBe('Switch to the dark theme');
    });

    test('should show a placeholder of the language menu until it loads, disabled', async () => {
        // Then
        expect(fixture.nativeElement.querySelector('app-language-menu')).toBeNull();
        expect(fixture.nativeElement.querySelector('nav [aria-label="Choose the language"]')?.getAttribute('aria-disabled')).toBe('true');

        // When
        await loadLanguageMenu();

        // Then
        expect(fixture.nativeElement.querySelector('app-language-menu #language-button')).not.toBeNull();
    });

    test('picking a language in the menu should translate the texts shown, without a reload', async () => {
        // Given
        expect(navTexts()).toEqual(['Home', 'Synchronous chess', 'Chat']);
        await loadLanguageMenu();
        fixture.nativeElement.querySelector('#language-button').click();
        await fixture.whenStable();

        // When
        document.querySelector<HTMLButtonElement>('[role="menuitemradio"][lang="fr"]')?.click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(LanguageService).language()).toBe(Language.FR);
        expect(navTexts()).toEqual(['Accueil', 'Échecs synchrones', 'Tchat']);
        expect(themeButton().getAttribute('aria-label')).toBe('Passer au thème sombre');
        expect(TestBed.inject(Title).getTitle()).toBe('Échecs synchrones');
        expect(document.documentElement.lang).toBe(Language.FR);
    });
});
