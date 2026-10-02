import { SealedTurnStore, StoredTurn } from './sealed-turn-store';
import { SealedActionKind } from './synchronous-chess-online-game-session';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const turn0: StoredTurn = { turn: 0, colors: [PieceColor.WHITE, PieceColor.BLACK], action: { kind: SealedActionKind.MOVE, move: null }, salt: 'salt0' };
const turn1: StoredTurn = { turn: 1, colors: [PieceColor.WHITE], action: { kind: SealedActionKind.PROMOTION, pieceType: PieceType.QUEEN }, salt: 'salt1' };

describe('SealedTurnStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should keep the turns of a player in a room across the pages of the tab', () => {
        // Given
        new SealedTurnStore('room', 'a').save(turn0);
        new SealedTurnStore('room', 'a').save(turn1);

        // When
        const store: SealedTurnStore = new SealedTurnStore('room', 'a');

        // Then
        expect(store.get(0)).toEqual(turn0);
        expect(store.get(1)).toEqual(turn1);
        expect(new SealedTurnStore('room', 'b').get(0)).toBeUndefined();
        expect(new SealedTurnStore('other', 'a').get(0)).toBeUndefined();
    });

    test('should remove a turn once revealed', () => {
        // Given
        const store: SealedTurnStore = new SealedTurnStore('room', 'a');
        store.save(turn0);
        store.save(turn1);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

        // When
        store.remove(0);
        store.remove(0);

        // Then
        expect(store.get(0)).toBeUndefined();
        expect(store.get(1)).toEqual(turn1);
        expect(setItemSpy).toHaveBeenCalledOnce();
    });

    test('should go on without the storage when it is blocked', () => {
        // Given
        const store: SealedTurnStore = new SealedTurnStore('room', 'a', () => {
            throw new Error('blocked');
        });

        // When
        store.save(turn0);

        // Then
        expect(store.get(0)).toBeUndefined();
        expect(TimedLogger.warn).toHaveBeenCalledWith('The committed actions can not be read, a reload can not reveal them', new Error('blocked'));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The committed actions can not be stored, a reload can not reveal them', new Error('blocked'));
    });

    test('should use the session storage of the browser by default', () => {
        expect(TestHelper.cast<{ storage(): Storage }>(new SealedTurnStore('room', 'a')).storage()).toBe(sessionStorage);
    });
});
