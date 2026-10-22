import { TEST_GROUP } from '@testing/sra-test-group';
import { TestHelper } from '@testing/test.helper';
import { describe, expect, test } from 'vitest';
import { MentalDeckMessage, MentalDeckMessageType } from '../mental-deck-messages';
import { DeckPhase, MentalDeckState } from './mental-deck-state';
import { SraCipher } from './sra-cipher';

const cipher = new SraCipher(TEST_GROUP);

function step(from: string, type: MentalDeckMessageType.SHUFFLE | MentalDeckMessageType.LOCK): MentalDeckMessage {
    return { from, type, payload: { deck: 'deck', cards: [0, 1, 2].map((card: number) => SraCipher.toHex(cipher.encode(card))) } };
}

describe('MentalDeckState', () => {
    test('should settle a card the game did not ask for once the deck is ready, no key being missing', () => {
        // Given
        const state = new MentalDeckState(3, ['a', 'b'], cipher);
        expect(state.isSettled(2)).toEqual(false);

        // When
        [step('a', MentalDeckMessageType.SHUFFLE), step('b', MentalDeckMessageType.SHUFFLE), step('a', MentalDeckMessageType.LOCK), step('b', MentalDeckMessageType.LOCK)]
            .forEach((message: MentalDeckMessage) => expect(state.apply(message)).toBeUndefined());

        // Then
        expect(state.phase).toEqual(DeckPhase.READY);
        expect(state.stepAuthor).toBeUndefined();
        expect(state.isSettled(2)).toEqual(true);
    });

    test('should ignore a message of an unknown type', () => {
        // Given
        const state = new MentalDeckState(3, ['a', 'b'], cipher);

        // When / Then
        expect(state.apply(TestHelper.cast<MentalDeckMessage>({ from: 'a', type: 'unknown', payload: { deck: 'deck' } }))).toBeUndefined();
        expect(state.phase).toEqual(DeckPhase.SHUFFLING);
    });
});
