import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { RoomPasswordDialog } from './room-password.dialog';

describe('RoomPasswordDialog', () => {
    async function createDialog(): Promise<{ fixture: ComponentFixture<RoomPasswordDialog>; passwords: string[] }> {
        const fixture: ComponentFixture<RoomPasswordDialog> = TestBed.createComponent(RoomPasswordDialog);
        const passwords: string[] = [];
        fixture.componentRef.setInput('roomName', 'private');
        fixture.componentInstance.result.subscribe((password: string) => passwords.push(password));
        await fixture.whenStable();
        return { fixture, passwords };
    }

    async function join(fixture: ComponentFixture<RoomPasswordDialog>): Promise<void> {
        (fixture.nativeElement.querySelector('#room-password-join') as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    test('should give the typed password, hidden as it is typed', async () => {
        // Given
        const { fixture, passwords } = await createDialog();
        const input: HTMLInputElement = fixture.nativeElement.querySelector('app-text-field[label="Mot de passe"] input');
        input.value = ' secret ';
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();

        // When
        await join(fixture);

        // Then
        expect(fixture.nativeElement.querySelector('p').textContent).toContain('La salle « private » est privée');
        expect(input.type).toEqual('password');
        expect(passwords).toEqual([' secret ']);
    });

    test('should require a password', async () => {
        // Given
        const { fixture, passwords } = await createDialog();

        // When
        await join(fixture);

        // Then
        expect(passwords).toEqual([]);
        expect(fixture.nativeElement.querySelector('mat-error').textContent.trim()).toEqual('Le mot de passe est requis');
    });
});
