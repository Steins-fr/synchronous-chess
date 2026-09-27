import { LocalPlayer } from './local-player';
import { describe, test, expect } from 'vitest';

class MarkLocalPlayer extends LocalPlayer {
    public nextMarkId(): string {
        return this.markIdGenerator.next().value;
    }
}

describe('LocalPlayer', () => {
    test('should be a local player', () => {
        // Given
        const player: LocalPlayer = new LocalPlayer('a');

        // When
        player.clear();

        // Then
        expect(player.name).toEqual('a');
        expect(player.isLocal).toEqual(true);
    });

    test('sendData should throw', () => {
        // Given
        const player: LocalPlayer = new LocalPlayer('a');

        // When
        const call = (): void => player.sendData();

        // Then
        expect(call).toThrow('Local player cannot send data');
    });

    test('should generate incremental mark ids', () => {
        // Given
        const player: MarkLocalPlayer = new MarkLocalPlayer('a');

        // When / Then
        expect(player.nextMarkId()).toEqual('a-1');
        expect(player.nextMarkId()).toEqual('a-2');
    });
});
