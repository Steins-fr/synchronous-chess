import { TestBed } from '@angular/core/testing';
import RoomSetupService, { RoomSetupInterface } from './room-setup.service';
import { describe, expect, test } from 'vitest';

describe('RoomSetupService', () => {
    test('setup should emit the setup and start loading', () => {
        // Given
        TestBed.configureTestingModule({ providers: [RoomSetupService] });
        const service: RoomSetupService = TestBed.inject(RoomSetupService);
        const setups: RoomSetupInterface[] = [];
        const loadings: boolean[] = [];
        service.setup$.subscribe((setup: RoomSetupInterface) => setups.push(setup));
        service.loading$.subscribe((loading: boolean) => loadings.push(loading));

        // When
        service.setup('create', 'room', 'player');
        service.setup('join', 'private', 'player', 'secret');

        // Then
        expect(setups).toEqual([
            { type: 'create', roomName: 'room', playerName: 'player' },
            { type: 'join', roomName: 'private', playerName: 'player', password: 'secret' },
        ]);
        expect(loadings).toEqual([false, true, true]);
    });

    test('roomIsSetup should emit the room state and stop loading', () => {
        // Given
        const service: RoomSetupService = new RoomSetupService();
        const roomIsSetups: boolean[] = [];
        const loadings: boolean[] = [];
        service.roomIsSetup$.subscribe((roomIsSetup: boolean) => roomIsSetups.push(roomIsSetup));
        service.loading$.subscribe((loading: boolean) => loadings.push(loading));
        service.setup('join', 'room', 'player');

        // When
        service.roomIsSetup(true);

        // Then
        expect(roomIsSetups).toEqual([false, true]);
        expect(loadings).toEqual([false, true, false]);
    });
});
