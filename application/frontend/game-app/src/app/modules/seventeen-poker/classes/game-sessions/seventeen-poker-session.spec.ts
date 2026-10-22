import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { DeckVerification } from '@app/modules/mental-poker/classes/mental-deck';
import { DeckPhase } from '@app/modules/mental-poker/classes/mental-deck-state';
import { SraCipher } from '@app/modules/mental-poker/classes/sra-cipher';
import { MentalDeckMessageType } from '@app/modules/mental-poker/mental-deck-messages';
import { PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { TEST_GROUP } from '@testing/sra-test-group';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BetAction } from '../rules/betting-round';
import { compareHands, evaluateHand } from '../rules/hand-evaluator';
import { HandEnd, HandPhase, PokerMatchRules, SEVENTEEN_POKER_RULES } from '../rules/poker-match';
import { PokerSeat } from '../rules/poker-seat';
import { pokerBlockChains, PokerPayloads, SeventeenPokerSession, SPGameSessionType } from './seventeen-poker-session';

const cipher = new SraCipher(TEST_GROUP);
const { ONE, TWO } = PokerSeat;

type Tamper = (message: AppMessage) => AppMessage;

/** Lets the sessions apply the messages delivered */
const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve));

describe('SeventeenPokerSession', () => {
    let hub: RoomHub<PokerPayloads>;
    let rooms: Map<string, Room<PokerPayloads>>;
    let sessions: SeventeenPokerSession[];

    function page(name: string, rules?: PokerMatchRules, tamper?: Tamper): SeventeenPokerSession {
        const room: Room<PokerPayloads> = hub.room(name, tamper);
        const session = new SeventeenPokerSession(room, { cipher, rules });
        rooms.set(name, room);
        sessions.push(session);
        return session;
    }

    /** Alice on the first seat, Bob on the second one, Carol watching */
    function table(rules?: PokerMatchRules, tampers: { bob?: Tamper } = {}): [SeventeenPokerSession, SeventeenPokerSession, SeventeenPokerSession] {
        const alice: SeventeenPokerSession = page('alice', rules);
        const bob: SeventeenPokerSession = page('bob', rules, tampers.bob);
        const carol: SeventeenPokerSession = page('carol', rules);
        alice.takeSeat(ONE);
        bob.takeSeat(TWO);
        return [alice, bob, carol];
    }

    /** The cards of a seat the session reads */
    const read = (session: SeventeenPokerSession, seat: PokerSeat): Array<PlayingCard | null> => session.cards()[seat].map(({ card }) => card);
    const known = (session: SeventeenPokerSession, seat: PokerSeat): boolean => read(session, seat).length === 5 && read(session, seat).every((card: PlayingCard | null) => card !== null);

    /** Waits until every participant applied the messages of the chain, the deals read */
    async function settled(of: ReadonlyArray<SeventeenPokerSession>, check: (session: SeventeenPokerSession) => boolean): Promise<void> {
        await vi.waitFor(() => of.forEach((session: SeventeenPokerSession) => {
            expect(check(session)).toBe(true);
            expect(session.dealing()).toBe(false);
        }));
    }

    /** Deals the hand, then waits for each player to read its cards */
    async function deal(alice: SeventeenPokerSession, bob: SeventeenPokerSession, carol: SeventeenPokerSession, index: number = 0): Promise<void> {
        alice.deal();
        await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.match.hand()?.index === index);
        await settled([alice], (session: SeventeenPokerSession) => known(session, ONE));
        await settled([bob], (session: SeventeenPokerSession) => known(session, TWO));
    }

    function messagesOf(type: string, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<PokerPayloads>();
        rooms = new Map();
        sessions = [];
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: SeventeenPokerSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should route the game and its decks to the chain of the poker', () => {
        expect(pokerBlockChains).toEqual({
            [SPGameSessionType.SEAT]: BlockChainName.POKER,
            [SPGameSessionType.DEAL]: BlockChainName.POKER,
            [SPGameSessionType.BET]: BlockChainName.POKER,
            [SPGameSessionType.EXCHANGE]: BlockChainName.POKER,
            [MentalDeckMessageType.SHUFFLE]: BlockChainName.POKER,
            [MentalDeckMessageType.LOCK]: BlockChainName.POKER,
            [MentalDeckMessageType.KEYS]: BlockChainName.POKER,
            [MentalDeckMessageType.DISCLOSE]: BlockChainName.POKER,
        });
    });

    describe('seats', () => {
        test('should seat the first participant asking for a free seat, each one on a single seat', async () => {
            // Given
            const alice: SeventeenPokerSession = page('alice');
            const bob: SeventeenPokerSession = page('bob');
            page('carol');

            // When
            alice.takeSeat(ONE);
            bob.takeSeat(ONE);
            alice.takeSeat(TWO);
            bob.takeSeat(ONE);
            await settled(sessions, (session: SeventeenPokerSession) => session.seats()[ONE] === 'bob');

            // Then
            expect(sessions.map((session: SeventeenPokerSession) => session.seats())).toEqual([['bob', 'alice'], ['bob', 'alice'], ['bob', 'alice']]);
            expect(alice.mySeat()).toEqual(TWO);
            expect(bob.mySeat()).toEqual(ONE);
            expect(sessions[2].mySeat()).toBeNull();
            expect(alice.spectatorNumber()).toEqual(1);
            expect(alice.seatsOpen()).toBe(true);
        });

        test('should free the seat a participant leaves', async () => {
            // Given
            const alice: SeventeenPokerSession = page('alice');
            alice.takeSeat(TWO);

            // When
            alice.leaveSeat();
            await flush();

            // Then
            expect(alice.seats()).toEqual([null, null]);
            expect(alice.mySeat()).toBeNull();
        });

        test('should ignore a request for a seat that does not exist', async () => {
            // Given
            const alice: SeventeenPokerSession = page('alice');

            // When
            hub.send({ from: 'bob', type: SPGameSessionType.SEAT, payload: { seat: 2 } });
            alice.takeSeat(ONE);
            await flush();

            // Then
            expect(alice.seats()).toEqual(['alice', null]);
        });

        test('should tell the seated players who left the room', async () => {
            // Given
            const [alice] = table();
            await flush();

            // When
            hub.leave(rooms.get('bob') as Room<PokerPayloads>);

            // Then
            expect(alice.awayPlayers()).toEqual(['bob']);
        });

        test('should keep the seats once the first hand is dealt', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);

            // When
            alice.leaveSeat();
            carol.takeSeat(ONE);
            bob.deal();
            await flush();

            // Then
            expect(carol.seatsOpen()).toBe(false);
            expect(carol.seats()).toEqual(['alice', 'bob']);
        });
    });

    describe('deal', () => {
        test('should deal 5 cards to each player, read by their recipient only', async () => {
            // Given
            const [alice, bob, carol] = table();

            // When
            await deal(alice, bob, carol);

            // Then
            expect(alice.positions()).toEqual([[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
            expect(known(alice, ONE)).toBe(true);
            expect(read(alice, TWO)).toEqual([null, null, null, null, null]);
            expect(known(bob, TWO)).toBe(true);
            expect(read(bob, ONE)).toEqual([null, null, null, null, null]);
            expect([...read(carol, ONE), ...read(carol, TWO)].every((card: PlayingCard | null) => card === null)).toBe(true);
            expect(carol.deck()?.players).toEqual(['alice', 'bob']);
            expect(carol.deckCount()).toEqual(7);
            expect(carol.match.stacks()).toEqual([145, 145]);
            expect(alice.myTurn()).toBe(true);
            expect(bob.myTurn()).toBe(false);
            expect(carol.myTurn()).toBe(false);
        });

        test('should show the whole deck until it is ready', () => {
            // Given
            const [alice, , carol] = table();

            // When
            alice.deal();

            // Then
            expect(carol.deckCount()).toEqual(17);
        });

        test.each<{ name: string; from: string; payload: unknown }>([
            { name: 'a spectator', from: 'carol', payload: { hand: 0, deck: 'random' } },
            { name: 'another hand', from: 'alice', payload: { hand: 1, deck: 'random' } },
            { name: 'a deck without id', from: 'alice', payload: { hand: 0, deck: '' } },
            { name: 'a deck of a long id', from: 'alice', payload: { hand: 0, deck: 'r'.repeat(65) } },
            { name: 'a deck of an id not a text', from: 'alice', payload: { hand: 0, deck: 3 } },
        ])('should not deal a hand asked by $name', async ({ from, payload }) => {
            // Given
            const [alice] = table();

            // When
            hub.send({ from, type: SPGameSessionType.DEAL, payload });
            await flush();

            // Then
            expect(alice.match.hand()).toBeNull();
            expect(alice.deck()).toBeNull();
        });

        test('should not deal before both seats are taken', async () => {
            // Given
            const alice: SeventeenPokerSession = page('alice');
            alice.takeSeat(ONE);

            // When
            alice.deal();
            await flush();

            // Then
            expect(alice.match.hand()).toBeNull();
        });

        test('should deal a hand once when both players ask for it', async () => {
            // Given
            const [alice, bob, carol] = table();

            // When
            bob.deal();
            await deal(alice, bob, carol);

            // Then
            expect(carol.deck()?.id).toEqual(`${ (messagesOf(SPGameSessionType.DEAL, 'bob')[0].payload as { deck: string }).deck }:0`);
            expect(messagesOf(MentalDeckMessageType.SHUFFLE)).toHaveLength(2);
        });

        test('should stop the match when the deck of the hand is broken', async () => {
            // Given: Bob locks the deck with cards not of the deck
            const [alice, bob, carol] = table(undefined, {
                bob: (message: AppMessage) => message.type === MentalDeckMessageType.LOCK ? { ...message, payload: { ...message.payload as object, cards: ['1'] } } : message,
            });

            // When
            alice.deal();
            await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.broken());

            // Then
            expect(carol.deck()?.phase()).toEqual(DeckPhase.BROKEN);
            expect(alice.myTurn()).toBe(false);
            alice.bet(BetAction.CHECK);
            expect(alice.match.hand()?.round.toAct).toEqual(ONE);
        });
    });

    describe('betting', () => {
        test('should end the hand as a no contest when both players check', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);

            // When
            alice.bet(BetAction.CHECK);
            await settled([bob], (session: SeventeenPokerSession) => session.myTurn());
            bob.bet(BetAction.CHECK);
            await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.match.hand()?.phase === HandPhase.OVER);

            // Then
            expect(carol.match.outcomes()).toEqual([{ end: HandEnd.NO_CONTEST, winner: null, pot: 10, gains: [0, 0], hands: null }]);
            expect(carol.match.stacks()).toEqual([145, 145]);
        });

        test('should keep the local player from acting again until its action is in the chain', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);
            hub.hold('alice');

            // When
            alice.bet(BetAction.CHECK);

            // Then
            expect(alice.sending()).toBe(true);
            expect(alice.myTurn()).toBe(false);

            // When
            hub.release();
            await settled([alice], (session: SeventeenPokerSession) => !session.sending());

            // Then
            expect(alice.match.hand()?.round.toAct).toEqual(TWO);
        });

        test('should report an action before the first hand', async () => {
            // Given
            const [alice, , carol] = table();

            // When
            alice.bet(BetAction.CHECK);
            alice.exchange([]);
            await flush();

            // Then
            expect(hub.reported().filter((report: string) => report.startsWith('carol'))).toEqual([
                `carol ${ CheatReason.ILLEGAL_MOVE } alice`,
                `carol ${ CheatReason.ILLEGAL_MOVE } alice`,
            ]);
            expect(carol.match.hand()).toBeNull();
        });

        test('should report an action out of the turn of its player, or of another hand', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);

            // When
            bob.bet(BetAction.CHECK);
            hub.send({ from: 'alice', type: SPGameSessionType.BET, payload: { hand: 3, action: BetAction.CHECK } });
            hub.send({ from: 'alice', type: SPGameSessionType.BET, payload: { hand: 0, action: BetAction.BET, amount: '10' } });
            hub.send({ from: 'carol', type: SPGameSessionType.BET, payload: { hand: 0, action: BetAction.CHECK } });
            alice.bet(BetAction.BET, 10);
            await settled([carol], (session: SeventeenPokerSession) => session.match.hand()?.round.toAct === TWO);

            // Then
            expect(hub.reported().filter((report: string) => report.startsWith('carol'))).toEqual([
                `carol ${ CheatReason.ILLEGAL_MOVE } bob`,
                `carol ${ CheatReason.ILLEGAL_MOVE } alice`,
                `carol ${ CheatReason.ILLEGAL_MOVE } alice`,
            ]);
            expect(carol.match.hand()?.round.bets).toEqual([10, 0]);
        });

        test('should give the pot to the other player when a player folds, its hand staying hidden', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);

            // When
            alice.bet(BetAction.BET, 10);
            await settled([bob], (session: SeventeenPokerSession) => session.myTurn());
            bob.bet(BetAction.FOLD);
            await settled([carol], (session: SeventeenPokerSession) => session.match.hand()?.phase === HandPhase.OVER);

            // Then
            expect(carol.match.hand()?.outcome?.end).toEqual(HandEnd.FOLD);
            expect(carol.match.stacks()).toEqual([155, 145]);
            expect(read(carol, TWO)).toEqual([null, null, null, null, null]);
            expect(read(alice, TWO)).toEqual([null, null, null, null, null]);
        });
    });

    describe('exchange', () => {
        async function exchanging(): Promise<[SeventeenPokerSession, SeventeenPokerSession, SeventeenPokerSession]> {
            const players = table();
            const [alice, bob, carol] = players;
            await deal(alice, bob, carol);
            alice.bet(BetAction.BET, 10);
            await settled([bob], (session: SeventeenPokerSession) => session.myTurn());
            bob.bet(BetAction.CALL);
            await settled([alice], (session: SeventeenPokerSession) => session.match.hand()?.phase === HandPhase.EXCHANGE);
            return players;
        }

        test('should deal the cards drawn in place of the ones discarded, from the draw pile', async () => {
            // Given
            const [alice, bob, carol] = await exchanging();
            const kept: Array<PlayingCard | null> = read(alice, ONE);

            // When
            alice.exchange([1, 3]);
            await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.match.exchanging() === TWO);
            await settled([alice], (session: SeventeenPokerSession) => known(session, ONE));

            // Then
            expect(carol.positions()[ONE]).toEqual([0, 10, 2, 11, 4]);
            expect(read(alice, ONE)[0]).toEqual(kept[0]);
            expect(read(bob, ONE)).toEqual([null, null, null, null, null]);
            expect(carol.deckCount()).toEqual(5);
            expect(bob.myTurn()).toBe(true);

            // When
            bob.exchange([]);
            await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.match.hand()?.phase === HandPhase.SECOND_ROUND);

            // Then
            expect(carol.positions()[TWO]).toEqual([5, 6, 7, 8, 9]);
            expect(messagesOf(MentalDeckMessageType.KEYS, 'bob').at(-1)?.payload).toMatchObject({ keys: [{ position: 10 }, { position: 11 }] });
            expect(alice.myTurn()).toBe(true);
        });

        test.each<{ name: string; from: string; positions: unknown }>([
            { name: 'a card of the other player', from: 'alice', positions: [5] },
            { name: 'a card twice', from: 'alice', positions: [1, 1] },
            { name: 'no list', from: 'alice', positions: 1 },
            { name: 'a player out of its turn', from: 'bob', positions: [5] },
        ])('should report an exchange of $name', async ({ from, positions }) => {
            // Given
            const [alice, , carol] = await exchanging();

            // When
            hub.send({ from, type: SPGameSessionType.EXCHANGE, payload: { hand: 0, positions } });
            alice.exchange([]);
            await settled([carol], (session: SeventeenPokerSession) => session.match.exchanging() === TWO);

            // Then
            expect(hub.reported()).toContain(`carol ${ CheatReason.ILLEGAL_MOVE } ${ from }`);
            expect(carol.positions()[ONE]).toEqual([0, 1, 2, 3, 4]);
        });

        test('should ignore an exchange of a spectator', async () => {
            // Given
            const [alice, , carol] = await exchanging();

            // When
            carol.exchange([0]);
            alice.exchange([]);
            await settled([carol], (session: SeventeenPokerSession) => session.match.exchanging() === TWO);

            // Then
            expect(hub.reported()).toEqual([]);
        });
    });

    describe('showdown', () => {
        /** Plays the hand to the showdown, each player keeping its cards, until the hand is over */
        async function showdown(
            alice: SeventeenPokerSession,
            bob: SeventeenPokerSession,
            carol: SeventeenPokerSession,
            over: (session: SeventeenPokerSession) => boolean = (session: SeventeenPokerSession) => session.match.hand()?.phase === HandPhase.OVER,
        ): Promise<void> {
            alice.bet(BetAction.CHECK);
            await settled([bob], (session: SeventeenPokerSession) => session.myTurn());
            bob.bet(BetAction.BET, 20);
            await settled([alice], (session: SeventeenPokerSession) => session.myTurn());
            alice.bet(BetAction.CALL);
            await settled([alice], (session: SeventeenPokerSession) => session.myTurn());
            alice.exchange([]);
            await settled([bob], (session: SeventeenPokerSession) => session.myTurn());
            bob.exchange([]);
            await settled([alice], (session: SeventeenPokerSession) => session.myTurn());
            alice.bet(BetAction.CHECK);
            await settled([bob], (session: SeventeenPokerSession) => session.myTurn());
            bob.bet(BetAction.CHECK);
            await settled([alice, bob, carol], over);
        }

        test('should show both hands to everyone, the best one taking the pot', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);

            // When
            await showdown(alice, bob, carol);

            // Then
            const hands = [read(carol, ONE), read(carol, TWO)] as PlayingCard[][];
            const comparison: number = compareHands(evaluateHand(hands[0]), evaluateHand(hands[1]));
            expect(hands.flat().every((card: PlayingCard | null) => card !== null)).toBe(true);
            expect(read(alice, TWO)).toEqual(hands[1]);
            expect(carol.match.hand()?.outcome?.end).toEqual(HandEnd.SHOWDOWN);
            expect(carol.match.hand()?.outcome?.winner).toEqual(comparison === 0 ? null : comparison > 0 ? ONE : TWO);
            expect(alice.match.stacks()).toEqual(carol.match.stacks());
        });

        test('should stop the match when a hand shown does not open', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);
            vi.spyOn(carol.deck() as NonNullable<ReturnType<typeof carol.deck>>, 'open').mockResolvedValue(new Map([[0, undefined]]));

            // When
            await showdown(alice, bob, carol, (session: SeventeenPokerSession) => session === carol ? session.broken() : session.match.hand()?.phase === HandPhase.OVER);

            // Then
            expect(carol.match.hand()?.phase).toEqual(HandPhase.SHOWDOWN);
        });

        test('should stop the match when the deck breaks at the showdown', async () => {
            // Given
            const [alice, bob, carol] = table();
            await deal(alice, bob, carol);
            vi.spyOn(carol.deck() as NonNullable<ReturnType<typeof carol.deck>>, 'open').mockRejectedValue(new Error('broken'));

            // When
            await showdown(alice, bob, carol, (session: SeventeenPokerSession) => session === carol ? session.broken() : session.match.hand()?.phase === HandPhase.OVER);

            // Then
            expect(carol.match.hand()?.outcome).toBeNull();
        });
    });

    describe('end of the match', () => {
        test('should disclose and check every deck once the match is over', async () => {
            // Given
            const [alice, bob, carol] = table({ ...SEVENTEEN_POKER_RULES, hands: 2 });

            // When
            for (let hand: number = 0; hand < 2; hand++) {
                await deal(alice, bob, carol, hand);
                const first: SeventeenPokerSession = hand === 0 ? alice : bob;
                const second: SeventeenPokerSession = hand === 0 ? bob : alice;
                first.bet(BetAction.BET, 5);
                await settled([second], (session: SeventeenPokerSession) => session.myTurn());
                second.bet(BetAction.FOLD);
                await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.match.hand()?.phase === HandPhase.OVER);
            }

            // Then
            expect(carol.match.result()).toEqual({ winner: null, stacks: [150, 150] });
            await settled([alice, bob, carol], (session: SeventeenPokerSession) => session.verification() === DeckVerification.FAIR);
            expect(messagesOf(MentalDeckMessageType.DISCLOSE)).toHaveLength(4);
            expect(read(carol, ONE).every((card: PlayingCard | null) => card !== null)).toBe(true);
            expect(hub.reports).toEqual([]);
        });

        test('should tell a cheated deck once checked', async () => {
            // Given
            const [alice, bob, carol] = table({ ...SEVENTEEN_POKER_RULES, hands: 1 });
            await deal(alice, bob, carol);
            vi.spyOn(carol.deck() as NonNullable<ReturnType<typeof carol.deck>>, 'disclose').mockResolvedValue(DeckVerification.CHEATED);

            // When
            alice.bet(BetAction.FOLD);
            await settled([carol], (session: SeventeenPokerSession) => session.verification() === DeckVerification.CHEATED);

            // Then
            expect(carol.match.result()?.winner).toEqual(TWO);
        });
    });

    test('should give back its cards to a player reloading the page', async () => {
        // Given
        const [alice, bob, carol] = table();
        await deal(alice, bob, carol);
        const cards: Array<PlayingCard | null> = read(bob, TWO);

        // When: the page of Bob loads again, the chain replaying its messages
        bob.destroy();
        hub.close(rooms.get('bob') as Room<PokerPayloads>);
        const reloaded: SeventeenPokerSession = page('bob');
        hub.replay(rooms.get('bob') as Room<PokerPayloads>);
        await settled([reloaded], (session: SeventeenPokerSession) => known(session, TWO));

        // Then
        expect(read(reloaded, TWO)).toEqual(cards);
        expect(reloaded.mySeat()).toEqual(TWO);
        alice.bet(BetAction.CHECK);
        await settled([reloaded], (session: SeventeenPokerSession) => session.myTurn());
        expect(reloaded.match.hand()?.round.toAct).toEqual(TWO);
    });

    test('should stop receiving the messages once destroyed', async () => {
        // Given
        const alice: SeventeenPokerSession = page('alice');
        alice.destroy();

        // When
        alice.takeSeat(ONE);
        await flush();

        // Then
        expect(alice.seats()).toEqual([null, null]);
    });
});
