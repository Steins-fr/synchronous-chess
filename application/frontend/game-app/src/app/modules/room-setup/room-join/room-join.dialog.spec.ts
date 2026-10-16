import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { RoomJoin, RoomJoinDialog } from './room-join.dialog';

describe('RoomJoinDialog', () => {
    let fixture: ComponentFixture<RoomJoinDialog>;
    let joins: RoomJoin[];

    async function createDialog(isPrivate: boolean, playerName?: string): Promise<void> {
        fixture = TestBed.createComponent(RoomJoinDialog);
        joins = [];
        fixture.componentRef.setInput('roomName', 'room');
        fixture.componentRef.setInput('isPrivate', isPrivate);
        if (playerName !== undefined) {
            fixture.componentRef.setInput('playerName', playerName);
        }
        fixture.componentInstance.result.subscribe((join: RoomJoin) => joins.push(join));
        await fixture.whenStable();
    }

    function input(label: string): HTMLInputElement {
        return fixture.nativeElement.querySelector(`app-text-field[label="${ label }"] input`);
    }

    async function typeIn(label: string, value: string): Promise<void> {
        input(label).value = value;
        input(label).dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    async function join(): Promise<void> {
        (fixture.nativeElement.querySelector('#room-join-submit') as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    function errors(): string[] {
        return Array.from(fixture.nativeElement.querySelectorAll('mat-error'), (error: Element) => error.textContent.trim());
    }

    test('should ask the name of the player joining a public room, the one of the form first', async () => {
        // Given
        await createDialog(false, 'alice');

        // Then
        expect(fixture.nativeElement.querySelector('p').textContent).toContain('Saisissez votre nom pour rejoindre la salle « room »');
        expect(input('Nom du joueur').value).toEqual('alice');
        expect(input('Mot de passe')).toBeNull();

        // When
        await typeIn('Nom du joueur', 'bob');
        await join();

        // Then
        expect(joins).toEqual([{ playerName: 'bob' }]);
    });

    test('should ask the name of the player and the password of a private room, hidden as it is typed', async () => {
        // Given
        await createDialog(true);
        await typeIn('Nom du joueur', 'bob');
        await typeIn('Mot de passe', ' secret ');

        // When
        await join();

        // Then
        expect(fixture.nativeElement.querySelector('p').textContent).toContain('La salle « room » est privée');
        expect(input('Mot de passe').type).toEqual('password');
        expect(joins).toEqual([{ playerName: 'bob', password: ' secret ' }]);
    });

    test('should require the name of the player, and the password of a private room', async () => {
        // Given
        await createDialog(true);
        await typeIn('Nom du joueur', '  ');

        // When
        await join();

        // Then
        expect(joins).toEqual([]);
        expect(errors()).toEqual(['Le nom du joueur est requis', 'Le mot de passe est requis']);
    });

    test('should not require a password for a public room', async () => {
        // Given
        await createDialog(false);

        // When
        await join();

        // Then
        expect(joins).toEqual([]);
        expect(errors()).toEqual(['Le nom du joueur est requis']);
    });

    test('should refuse a password shorter than the API accepts', async () => {
        // Given
        await createDialog(true, 'bob');
        await typeIn('Mot de passe', 'p'.repeat(5));

        // When
        await join();

        // Then
        expect(joins).toEqual([]);
        expect(errors()).toEqual(['Le mot de passe fait 6 caractères au moins']);
    });

    test('should refuse a password longer than the API accepts', async () => {
        // Given
        await createDialog(true, 'bob');
        await typeIn('Mot de passe', 'p'.repeat(129));

        // When
        await join();

        // Then
        expect(joins).toEqual([]);
        expect(errors()).toEqual(['Le mot de passe fait 128 caractères au plus']);
    });
});
