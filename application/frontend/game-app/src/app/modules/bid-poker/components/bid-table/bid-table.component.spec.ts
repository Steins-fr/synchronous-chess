import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { RoomHub } from '@testing/room-hub';
import { numberFieldInput } from '@testing/text-field.helper';
import { TestHelper } from '@testing/test.helper';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BidPokerPayloads, BPGameSessionType } from '../../classes/game-sessions/bid-poker-messages';
import { BidPokerSession } from '../../classes/game-sessions/bid-poker-session';
import { BidPokerPhase } from '../../classes/rules/bid-poker-game';
import { BID_POKER_RULES, BidPokerRules } from '../../classes/rules/bid-poker-rules';
import { BID_POKER_SESSION_OPTIONS, BidTableComponent } from './bid-table.component';

/** Three lots of 5 cards and a single change session: the specs play a game to its end quickly */
const LIGHT: BidPokerRules = { ...BID_POKER_RULES, deck: BID_POKER_RULES.deck.slice(0, 15), lotSizes: [5], changeSessions: 1 };
const OTHERS: ReadonlyArray<string> = ['bob', 'carol', 'dave'];
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('BidTableComponent', { timeout: 30_000 }, () => {
    let hub: RoomHub<BidPokerPayloads>;
    let fixture: ComponentFixture<BidTableComponent>;
    let others: Map<string, BidPokerSession>;
    let rooms: Map<string, Room<BidPokerPayloads>>;

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const buttons = (root: ParentNode = element()): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const button = (label: string, root?: ParentNode): HTMLButtonElement | undefined =>
        buttons(root).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);
    const of = (name: string): BidPokerSession => others.get(name) as BidPokerSession;
    const session = (): BidPokerSession => TestHelper.cast<{ session(): BidPokerSession }>(fixture.componentInstance).session();
    const history = (): ReadonlyArray<string> => fixture.componentInstance.history().map(translated);

    async function until(check: () => boolean): Promise<void> {
        await eventually(async () => {
            await fixture.whenStable();
            expect(check(), `status: ${ status() } | phase: ${ session().game()?.phase() } | awaited: ${ session().awaited() } | held: ${ hub.held.map(({ from, type }) => `${ from } ${ type }`) }`).toBe(true);
        });
    }

    async function click(label: string, root?: ParentNode): Promise<void> {
        (button(label, root) as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    /** The table of Alice, Bob, Carol and Dave in the room, Eve watching */
    async function table(): Promise<void> {
        TestBed.configureTestingModule({ providers: [{ provide: BID_POKER_SESSION_OPTIONS, useValue: { rules: LIGHT } }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(BidTableComponent);
        const room: Room<BidPokerPayloads> = hub.room('alice');
        rooms.set('alice', room);
        fixture.componentRef.setInput('room', room);
        [...OTHERS, 'eve'].forEach((name: string) => {
            const other: Room<BidPokerPayloads> = hub.room(name);
            rooms.set(name, other);
            others.set(name, new BidPokerSession(other, { rules: LIGHT }));
        });
        await fixture.whenStable();
    }

    /** Alice takes the first seat, the others the next ones */
    async function seated(): Promise<void> {
        await table();
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => status() === 'Start the game once every player is seated.');
    }

    async function started(): Promise<void> {
        await seated();
        await click('Start the game');
        await until(() => status() === 'Bid on lot A, sealed: 0 for no bid.');
    }

    /** Bob, Carol and Dave bid on the lot */
    async function othersBid(amounts: ReadonlyArray<number>): Promise<void> {
        await Promise.all(amounts.map((amount: number, index: number) => of(OTHERS[index]).bid(amount)));
    }

    /** The commitment of a player goes through, its reveal waiting */
    async function revealHeld(name: string, commit: () => Promise<unknown>): Promise<void> {
        hub.hold(name);
        await commit();
        await eventually(() => expect(hub.held).toHaveLength(1));
        hub.send(hub.held.splice(0, 1)[0]);
    }

    async function typeBid(amount: string): Promise<void> {
        const input: HTMLInputElement = numberFieldInput(element(), 'Your bid');
        input.value = amount;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        await click('Bid');
    }

    /** The dealing session: Alice buys lot A for 1 coin, Bob lot B, Carol lot C */
    async function dealt(): Promise<void> {
        await typeBid('1');
        await othersBid([0, 0, 0]);
        await until(() => status() === 'Bid on lot B, sealed: 0 for no bid.');
        await click('No bid');
        await othersBid([1, 0, 0]);
        await until(() => status() === 'Bid on lot C, sealed: 0 for no bid.');
        await click('No bid');
        await othersBid([0, 1, 0]);
        await until(() => session().game()?.phase() === BidPokerPhase.DISCARDING);
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<BidPokerPayloads>();
        others = new Map();
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fixture.destroy();
        others.forEach((other: BidPokerSession) => other.destroy());
        vi.restoreAllMocks();
    });

    test('should show the seats before the game, and start it once 4 players are seated', async () => {
        // Given
        await table();

        // Then
        expect(element().querySelectorAll('app-bid-seat')).toHaveLength(8);
        expect(status()).toEqual('0 players seated: the game starts with 4 at least.');
        expect(TestHelper.cast<{ myCoins(): number }>(fixture.componentInstance).myCoins()).toEqual(0);

        // When
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        of('bob').takeSeat(1);
        of('carol').takeSeat(2);
        of('dave').takeSeat(3);
        await until(() => status() === 'Start the game once every player is seated.');

        // Then the other players wait for one of them to start
        expect(of('bob').canStart()).toBe(true);
        expect(TestHelper.cast<{ myCoins(): number }>(fixture.componentInstance).myCoins()).toEqual(0);
        expect(text('#seat-1')).toContain('bob');
        expect(text('#seat-0')).toContain('Leave');

        // When
        await click('Start the game');

        // Then
        await until(() => status() === 'Bid on lot A, sealed: 0 for no bid.');
        expect(text('#session')).toEqual('Dealing session');
        expect(text('#bank')).toEqual('Bank: 0 coins');
        expect(element().querySelectorAll('#catalogue app-bid-lot')).toHaveLength(3);
        expect(text('#auction h2')).toEqual('Lot A · from the bank');
        expect(text('#seat-0')).toContain('300 coins');
        expect(button('Leave')).toBeUndefined();
    });

    test('should let a participant take any free seat', async () => {
        // Given
        await table();

        // When
        await click('Sit here', element().querySelector('#seat-5') as HTMLElement);

        // Then the table shows from the seat taken
        await until(() => element().querySelector('app-bid-seat:last-child')?.id === 'seat-5');
        expect(text('#seat-5')).toContain('alice');
    });

    test('should tell the players seated wait for one of them to start', async () => {
        // Given
        await table();
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index));
        of('eve').takeSeat(3);

        // Then
        await until(() => status() === '4 players seated: waiting for one of them to start.');
        expect(text('section > div')).toContain('1 spectator');
    });

    test('should tell the players drawing the deck', async () => {
        // Given
        await seated();
        hub.hold('dave');

        // When
        await click('Start the game');

        // Then
        await until(() => status() === 'The players shuffle the deck: waiting for dave.');
        hub.release();
        await until(() => status() === 'Bid on lot A, sealed: 0 for no bid.');
    });

    test('should seal the bid of the local player, then show the lot sold', async () => {
        // Given
        await started();

        // When
        await typeBid('12');

        // Then
        await until(() => status() === 'Sealed: waiting for bob, carol, dave.');
        expect(text('#actions')).toEqual('Your bid of 12 coins is sealed');
        expect(text('#seat-0')).toContain('Sealed');

        // When the reveal of Dave waits
        await othersBid([3, 0]);
        await revealHeld('dave', () => of('dave').bid(12));

        // Then
        await until(() => status() === 'The bids on lot A are revealed…');
        hub.release();
        await until(() => status() === 'Bid on lot B, sealed: 0 for no bid.');
        expect(text('#catalogue')).toContain('To alice for 12 coins');
        expect(history()).toEqual(['Lot A: alice wins for 12 coins, bid before dave (bids: alice 12, bob 3, carol 0, dave 12)']);
        expect(text('#seat-0')).toContain('288 coins');
        expect(element().querySelectorAll('#seat-0 app-playing-card')).toHaveLength(5);
        expect(text('#bank')).toEqual('Bank: 12 coins');
    });

    test.each([
        { amount: '400', error: 'At most your 300 coins' },
        { amount: '-1', error: '0 coins at least' },
        { amount: '1.5', error: 'Bid whole coins' },
    ])('should refuse a bid of $amount', async ({ amount, error }) => {
        // Given
        await started();

        // When
        await typeBid(amount);

        // Then
        expect(text('mat-error')).toEqual(error);
        expect(hub.types()).not.toContain(BPGameSessionType.COMMIT);
    });

    test('should take a lot nobody bids on out of the game', async () => {
        // Given
        await started();

        // When
        await click('No bid');
        await othersBid([0, 0, 0]);

        // Then
        await until(() => text('#catalogue').includes('Unsold: out of the game'));
    });

    test('should auction the discards of the players, then show the standings', async () => {
        // Given
        await started();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        await dealt();

        // Then
        expect(status()).toEqual('Pick the cards to discard, in their order, or keep yours.');
        expect(text('#session')).toEqual('Change session 1 of 1');
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS);

        // When Alice picks two of her cards
        const cards: HTMLButtonElement[] = Array.from(element().querySelectorAll<HTMLButtonElement>('#seat-0 app-card-hand button'));
        cards[3].click();
        cards[1].click();
        await fixture.whenStable();
        await click('Discard 2 cards');

        // Then
        await until(() => status() === 'Sealed: waiting for bob, carol.');

        // When
        await of('bob').discard([]);
        await of('carol').discard([]);

        // Then the lot of Alice is auctioned, she does not bid on it
        await until(() => status() === 'Lot A on auction: waiting for bob, carol, dave.');
        expect(text('#auction h2')).toEqual('Lot A · from alice');
        expect(play).toHaveBeenCalledWith(SoundEffect.POKER_DEAL);

        // When
        await othersBid([2, 0, 0]);

        // Then the game is over
        await until(() => status() === 'The game is over.');
        const rows: string[] = Array.from(element().querySelectorAll('#standings tbody tr'), (row: Element) => row.textContent ?? '');
        expect(rows).toHaveLength(4);
        expect(rows[0]).toContain('Place 1');
        expect(rows[3]).toContain('Pig');
        expect(text('#standings')).toContain('No hand');
        expect(text('#standings')).toContain('Pig');
        expect(text('#standings')).toContain('Place 1');
        expect(text('#seat-1 .badge-win')).toMatch(/Place [12]/);
        expect(element().querySelectorAll('#seat-1 app-playing-card .outline-3')).toHaveLength(5);
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_LOST);

        // The bid of the local player on the last lot no longer shows
        expect(text('#actions')).toEqual('Play again');

        // When
        await click('Play again');

        // Then
        await until(() => status() === 'Start the game once every player is seated.');
        expect(fixture.componentInstance.pastResults().map(pastLine)).toEqual([expect.stringMatching(/^Game 1: (bob|carol) first, 2 pigs: alice, dave$/)]);
    });

    test('should tell a former game without a winner, every player a pig', async () => {
        // Given
        await started();

        // When nobody buys a lot
        for (let lot = 0; lot < 3; lot++) {
            await click('No bid');
            await othersBid([0, 0, 0]);
            await until(() => session().game()?.committed().length === 0);
        }
        await until(() => status() === 'The game is over.');
        await click('Play again');

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(fixture.componentInstance.pastResults().map(pastLine)).toEqual(['Game 1: No winner, 4 pigs: alice, bob, carol, dave']);
    });

    test('should let the host free the first seat, its player away, every seat taken', async () => {
        // Given the host watches every seat taken
        hub.sequencer.set('alice');
        await table();
        const players: string[] = ['frank', 'grace', 'heidi', 'ivan'];
        players.forEach((name: string) => {
            const room: Room<BidPokerPayloads> = hub.room(name);
            rooms.set(name, room);
            others.set(name, new BidPokerSession(room, { rules: LIGHT }));
        });
        [...OTHERS, 'eve', ...players].forEach((name: string, seat: number) => of(name).takeSeat(seat));
        await until(() => session().tableSeats.taken().length === 8);

        // When
        hub.leave(rooms.get('bob') as Room<BidPokerPayloads>);
        await until(() => button('Free the seat', element().querySelector('#seat-0') as HTMLElement) !== undefined);
        await click('Free the seat', element().querySelector('#seat-0') as HTMLElement);

        // Then
        await until(() => text('#seat-0').includes('Free seat'));
    });

    test('should send back the discards nobody bids on, and tell the discards revealed', async () => {
        // Given
        await started();
        await dealt();

        // When Alice keeps her cards, Bob discards one, the reveal of Carol waiting
        await click('Keep my cards');
        await of('bob').discard([of('bob').game()?.holdings()[1][0] as number]);
        await revealHeld('carol', () => of('carol').discard([]));

        // Then
        await until(() => status() === 'The discards are revealed…');
        hub.release();
        await until(() => status() === 'Bid on lot A, sealed: 0 for no bid.');

        // When nobody bids on the lot of Bob
        await click('No bid');
        await Promise.all(['carol', 'dave'].map((name: string) => of(name).bid(0)));

        // Then
        await until(() => text('#catalogue').includes('Unsold: back to its seller'));
    });

    test('should tell the players discard, the local player without a card', async () => {
        // Given
        await started();

        // When Bob, Carol and Dave buy the lots
        for (const amounts of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
            await click('No bid');
            await othersBid(amounts);
            await until(() => session().game()?.committed().length === 0);
        }

        // Then
        await until(() => status() === 'The players discard: waiting for bob, carol, dave.');
    });

    test('should free the seat of a player away, and leave its seat', async () => {
        // Given
        await seated();

        // When
        hub.leave(rooms.get('bob') as Room<BidPokerPayloads>);
        await until(() => button('Free the seat', element().querySelector('#seat-1') as HTMLElement) !== undefined);
        await click('Free the seat');

        // Then
        await until(() => text('#seat-1').includes('Free seat'));

        // When
        await click('Leave');

        // Then
        await until(() => status() === '2 players seated: the game starts with 4 at least.');
    });

    test('should hear the seats taken and the catalogue drawn', async () => {
        // Given
        await table();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => status() === 'Start the game once every player is seated.');
        await click('Start the game');
        await until(() => status() === 'Bid on lot A, sealed: 0 for no bid.');

        // Then
        expect(play).toHaveBeenCalledWith(SoundEffect.SEAT_TAKEN);
        expect(play).toHaveBeenCalledWith(SoundEffect.POKER_SHUFFLE);
    });

    describe('the clock', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        async function elapse(seconds: number): Promise<void> {
            vi.advanceTimersByTime(seconds * 1000);
            await fixture.whenStable();
        }

        test('should hurry the local player, then claim the time over, the local player late too', async () => {
            // Given
            await started();
            await othersBid([5]);

            // When
            await elapse(LIGHT.catalogueTime + LIGHT.bidTime - 4);

            // Then
            expect(status()).toEqual('Hurry: your time runs out!');
            expect(text('#bid-clock')).toEqual('0:04');

            // When
            hub.time = LATER;
            await elapse(4);

            // Then the local player, absent, bids again when it likes
            await until(() => history().length === 2);
            expect(history()).toEqual(['Lot A: bob wins for 5 coins (bids: bob 5)', 'alice, carol, dave: no bid in time']);
            expect(status()).toEqual('Bid on lot B, sealed: 0 for no bid.');
            expect(text('#seat-0')).toContain('Skipped');
        });

        test('should claim nothing on a late tick of the clock of a phase closed', async () => {
            // Given the clock of lot A
            await started();
            const component = TestHelper.cast<{ timeOut(): void; clocked: unknown }>(fixture.componentInstance);
            const clockOfLotA: unknown = component.clocked;
            await click('No bid');
            await othersBid([0, 0, 0]);
            await until(() => status() === 'Bid on lot B, sealed: 0 for no bid.');

            // When it ticks once lot B is auctioned, before its effect stops it
            component.clocked = clockOfLotA;
            component.timeOut();

            // Then
            expect(hub.types()).not.toContain(BPGameSessionType.TIMEOUT);
        });

        test('should close the discards once their time is over, the local player late too', async () => {
            // Given
            hub.time = 0;
            await started();
            await dealt();

            // When
            hub.time = LATER;
            await elapse(LIGHT.discardTime);

            // Then the players late keep their cards
            await until(() => session().over());
            expect(history()[0]).toEqual('Change session 1: no card discarded');
            expect(history()[1]).toEqual('alice, bob, carol: no discard in time');
        });

        test('should claim again a little later, its claim too early on the time of the chain', async () => {
            // Given
            await started();
            await click('No bid');

            // When the time of the chain stands still
            await elapse(LIGHT.catalogueTime + LIGHT.bidTime);

            // Then
            await until(() => session().voidedClaims() === 1);
            expect(text('#bid-clock')).toEqual('0:05');

            // When
            hub.time = LATER;
            await elapse(5);

            // Then
            await until(() => status() === 'Bid on lot B, sealed: 0 for no bid.');
        });

        test('should wait longer for a player away', async () => {
            // Given
            await started();

            // When
            hub.leave(rooms.get('dave') as Room<BidPokerPayloads>);

            // Then the local player to bid reads its own prompt, then the player away
            await until(() => session().awayPlayers().length === 1);
            expect(status()).toEqual('Bid on lot A, sealed: 0 for no bid.');
            await click('No bid');
            await until(() => status() === 'Waiting for dave to come back…');
            expect(text('#seat-3')).toMatch(/\d:\d\d/);
        });
    });
});
