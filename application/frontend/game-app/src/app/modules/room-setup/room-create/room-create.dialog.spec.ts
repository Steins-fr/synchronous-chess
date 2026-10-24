import { ComponentFixture, TestBed } from '@angular/core/testing';
import { textFieldInput } from '@testing/text-field.helper';
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
        return textFieldInput(fixture.nativeElement, label);
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
        await typeIn('Room name', 'room');
        await typeIn('Player name', 'alice');

        // When
        await create();

        // Then
        expect(rooms).toEqual([{ roomName: 'room', playerName: 'alice' }]);
    });

    test('should give a private room with its password, hidden as it is typed', async () => {
        // Given
        await createDialog({ roomName: 'room', playerName: 'alice' });
        await typeIn('Password (private room)', 'secret');

        // When
        await create();

        // Then
        expect(input('Room name').value).toEqual('room');
        expect(input('Password (private room)').type).toEqual('password');
        expect(rooms).toEqual([{ roomName: 'room', playerName: 'alice', password: 'secret' }]);
    });

    test('should require the room and player names, spaces only refused', async () => {
        // Given
        await createDialog();
        await typeIn('Room name', '   ');

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['The room name is required', 'The player name is required']);
        expect(fixture.nativeElement.querySelectorAll('.mat-mdc-form-field-required-marker')).toHaveLength(2);
    });

    test('should refuse a password shorter than the API accepts', async () => {
        // Given
        await createDialog({ roomName: 'room', playerName: 'alice' });
        await typeIn('Password (private room)', 'p'.repeat(5));

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['The password is at least 6 characters long']);
    });

    test('should refuse a password longer than the API accepts', async () => {
        // Given
        await createDialog({ roomName: 'room', playerName: 'alice' });
        await typeIn('Password (private room)', 'p'.repeat(129));

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['The password is at most 128 characters long']);
    });

    test('should refuse the names longer than the API accepts', async () => {
        // Given
        await createDialog({ roomName: 'r'.repeat(33), playerName: 'p'.repeat(33) });

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['The room name is at most 32 characters long', 'The player name is at most 32 characters long']);
    });

    test('should refuse a room name holding the separator of the tag the API adds', async () => {
        // Given
        await createDialog({ roomName: 'friday#451203', playerName: 'alice' });

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['The room name cannot contain “#”']);
    });

    test.each([
        ['a space', 'friday night'],
        ['a no-break space', 'friday\u00A0night'],
        ['a zero width space', 'friday\u200Bnight'],
        ['a space after it', 'friday '],
    ])('should refuse a room name holding %s', async (_blank: string, roomName: string) => {
        // Given
        await createDialog({ roomName, playerName: 'alice' });

        // When
        await create();

        // Then
        expect(rooms).toEqual([]);
        expect(errors()).toEqual(['The room name cannot contain spaces']);
    });
});
