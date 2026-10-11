import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { RoomCreate, RoomCreateDialog } from './room-create.dialog';

describe('RoomCreateDialog', () => {
    let fixture: ComponentFixture<RoomCreateDialog>;
    let rooms: RoomCreate[];

    async function createDialog(inputs: { roomName?: string; playerName?: string } = {}): Promise<void> {
        fixture = TestBed.createComponent(RoomCreateDialog);
        rooms = [];
        Object.entries(inputs).forEach(([name, value]: [string, string]) => fixture.componentRef.setInput(name, value));
        fixture.componentInstance.result.subscribe((room: RoomCreate) => rooms.push(room));
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

    async function create(): Promise<void> {
        (fixture.nativeElement.querySelector('#room-create-submit') as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    function errors(): string[] {
        return Array.from(fixture.nativeElement.querySelectorAll('mat-error'), (error: Element) => error.textContent.trim());
    }

    test('should give a public room without password', async () => {
        // Given
        await createDialog();
        await typeIn('Nom de la salle', 'room');
        await typeIn('Nom du joueur', 'alice');

        // When
        await create();

        // Then
        expect(rooms).toEqual([{ roomName: 'room', playerName: 'alice' }]);
    });

    test('should give a private room with its password, hidden as it is typed', async () => {
        // Given
        await createDialog({ roomName: 'room', playerName: 'alice' });
        await typeIn('Mot de passe (salle privée)', 'secret');

        // When
        await create();

        // Then
        expect(input('Nom de la salle').value).toEqual('room');
        expect(input('Mot de passe (salle privée)').type).toEqual('password');
        expect(rooms).toEqual([{ roomName: 'room', playerName: 'alice', password: 'secret' }]);
    });

    test('should require the room and player names, spaces only refused', async () => {
        // Given
        await createDialog();
        await typeIn('Nom de la salle', '   ');

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['Le nom de la salle est requis', 'Le nom du joueur est requis']);
        expect(fixture.nativeElement.querySelectorAll('.mat-mdc-form-field-required-marker')).toHaveLength(2);
    });

    test('should refuse a password longer than the API accepts', async () => {
        // Given
        await createDialog({ roomName: 'room', playerName: 'alice' });
        await typeIn('Mot de passe (salle privée)', 'p'.repeat(129));

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['Le mot de passe fait 128 caractères au plus']);
    });

    test('should refuse the names longer than the API accepts', async () => {
        // Given
        await createDialog({ roomName: 'r'.repeat(33), playerName: 'p'.repeat(33) });

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['Le nom de la salle fait 32 caractères au plus', 'Le nom du joueur fait 32 caractères au plus']);
    });
});
