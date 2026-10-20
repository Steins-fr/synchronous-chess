import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, test } from 'vitest';
import { HomePage } from './home.page';

@Component({ template: '' })
class GamePage {}

describe('HomePage', () => {
    async function createPage(): Promise<ComponentFixture<HomePage>> {
        TestBed.configureTestingModule({
            providers: [provideRouter([{ path: 'synchronous-chess', component: GamePage }, { path: 'simple-chat', component: GamePage }])],
        });
        const fixture: ComponentFixture<HomePage> = TestBed.createComponent(HomePage);
        await fixture.whenStable();
        return fixture;
    }

    test.each<[string, string, string, string]>([
        ['chess', 'Synchronous chess', 'Play', '/synchronous-chess'],
        ['chat', 'Chat', 'Chat', '/simple-chat'],
    ])('should present the %s in a card leading to its page', async (game: string, title: string, action: string, path: string) => {
        // Given
        const fixture: ComponentFixture<HomePage> = await createPage();
        const card: HTMLAnchorElement = fixture.nativeElement.querySelector(`#game-card-${ game }`);

        // Then
        expect(card.querySelector('h2')?.textContent).toEqual(title);
        expect(card.querySelector('.game-card-action')?.textContent).toContain(action);
        expect(card.getAttribute('href')).toEqual(path);

        // When
        card.click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(Router).url).toEqual(path);
    });
});
