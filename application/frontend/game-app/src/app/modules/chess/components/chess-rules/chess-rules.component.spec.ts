import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChessRulesComponent } from './chess-rules.component';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('ChessRulesComponent', () => {
    let fixture: ComponentFixture<ChessRulesComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChessRulesComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChessRulesComponent);
        await fixture.whenStable();
    });

    function element(): HTMLElement {
        return fixture.nativeElement;
    }

    test('should show the rules with their title, a summary and the ends of the game', () => {
        // Then
        expect(element().querySelector('.title')?.textContent).toEqual('Règles');
        expect(element().querySelectorAll('.summary li')).toHaveLength(4);
        expect([...element().querySelectorAll('.case-card h4')].map((title: Element) => title.textContent?.trim())).toEqual(['a Capture', 'b Échange', 'c Confrontation']);
        expect(element().querySelectorAll('.ends tbody tr')).toHaveLength(7);
        expect(element().querySelectorAll('.ends .badge-win')).toHaveLength(2);
        expect(element().querySelector('.source a')?.getAttribute('href')).toEqual('http://www.hexenspiel.de/engl/synchronous-chess/');
    });

    test('should hide the title when the rules are already titled', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(element().querySelector('.title')).toBeNull();
    });

    test('should scroll to the section chosen in the table of contents', () => {
        // Given
        const sections: HTMLElement[] = [...element().querySelectorAll<HTMLElement>('section.rule-card')];
        const scrolled: HTMLElement[] = [];
        sections.forEach((section: HTMLElement) => {
            section.scrollIntoView = vi.fn(() => scrolled.push(section));
        });
        const buttons: HTMLButtonElement[] = [...element().querySelectorAll<HTMLButtonElement>('.table-of-contents button')];

        // When
        buttons.forEach((button: HTMLButtonElement) => button.click());

        // Then each button scrolls to its own section
        expect(buttons.map((button: HTMLButtonElement) => button.textContent)).toEqual(['Joueurs', 'Mouvement et capture', 'Tours intermédiaires', 'Promotion', 'Restrictions', 'Fin de partie']);
        expect(scrolled).toEqual(sections);
        expect(sections[0].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });
});
