import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { RoomHub } from '@testing/room-hub';
import { choiceFieldOption } from '@testing/text-field.helper';
import { TestHelper } from '@testing/test.helper';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EdenPayloads, GEGameSessionType } from '../../classes/game-sessions/eden-messages';
import { EdenSession } from '../../classes/game-sessions/eden-session';
import { EdenPhase } from '../../classes/rules/eden-game-state';
import { Apple, EDEN_RULES, EdenRules } from '../../classes/rules/eden-rules';
import { EDEN_SESSION_OPTIONS, EdenTableComponent } from './eden-table.component';

/** Two rounds: the specs play a game to its end quickly */
const LIGHT: EdenRules = { ...EDEN_RULES, rounds: 2 };
const OTHERS: ReadonlyArray<string> = ['bob', 'carol', 'dave'];
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;
const { GOLD, SILVER, RED } = Apple;

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client never revealing its apple of the second round */
const withholdingRound2: Tamper = (message: AppMessage) => message.type === GEGameSessionType.REVEAL && (message.payload as { round: number }).round === 1
    ? { ...message, payload: { ...message.payload as object, round: 99 } }
    : message;

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('EdenTableComponent', { timeout: 30_000 }, () => {
    let hub: RoomHub<EdenPayloads>;
    let fixture: ComponentFixture<EdenTableComponent>;
    let others: Map<string, EdenSession>;
    let rooms: Map<string, Room<EdenPayloads>>;

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const buttons = (root: ParentNode = element()): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const button = (label: string, root?: ParentNode): HTMLButtonElement | undefined =>
        buttons(root).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);
    const of = (name: string): EdenSession => others.get(name) as EdenSession;
    const session = (): EdenSession => TestHelper.cast<{ session(): EdenSession }>(fixture.componentInstance).session();
    const inMatch = (): boolean => TestHelper.cast<{ inMatch(): boolean }>(fixture.componentInstance).inMatch();
    const history = (): ReadonlyArray<string> => fixture.componentInstance.history().map(translated);
    const rows = (): string[] => Array.from(element().querySelectorAll('#standings tbody tr'), (row: Element) =>
        Array.from(row.children, (cell: Element) => cell.textContent?.trim()).join(' '));
    /** What a seat shows, each part apart: its first row, then its balance row */
    const seat = (index: number): string => {
        const host: Element | null = element().querySelector(`#seat-${ index }`);
        const parts: Element[] = [
            ...Array.from(host?.children ?? []).filter((part: Element) => !part.classList.contains('w-full')),
            ...Array.from(host?.querySelector('.w-full')?.children ?? []),
        ];
        return parts.map((part: Element) => part.textContent?.trim()).join(' | ');
    };

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
    async function table(tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        TestBed.configureTestingModule({ providers: [{ provide: EDEN_SESSION_OPTIONS, useValue: { rules: LIGHT } }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(EdenTableComponent);
        const room: Room<EdenPayloads> = hub.room('alice');
        rooms.set('alice', room);
        fixture.componentRef.setInput('room', room);
        [...OTHERS, 'eve'].forEach((name: string) => {
            const other: Room<EdenPayloads> = hub.room(name, tampers[name]);
            rooms.set(name, other);
            others.set(name, new EdenSession(other, { rules: LIGHT }));
        });
        await fixture.whenStable();
    }

    /** Alice takes the first seat, the others the next ones */
    async function seated(tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        await table(tampers);
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => status() === 'Pick the time to vote and the starting money, then start the game.');
    }

    /** Alice starts the game with the options picked: the first vote opens */
    async function started(...picked: ReadonlyArray<[string, string]>): Promise<void> {
        await seated();
        await start(...picked);
    }

    async function start(...picked: ReadonlyArray<[string, string]>): Promise<void> {
        for (const [label, option] of picked) {
            choiceFieldOption(element(), label, option).click();
            await fixture.whenStable();
        }
        await click('Start the game');
        await until(() => status() === 'Pick your apple, sealed: gold, silver or red.');
    }

    /** Bob, Carol and Dave vote */
    async function othersVote(apples: ReadonlyArray<Apple>): Promise<void> {
        await Promise.all(apples.map((apple: Apple, index: number) => of(OTHERS[index]).vote(apple)));
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<EdenPayloads>();
        others = new Map();
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fixture.destroy();
        others.forEach((other: EdenSession) => other.destroy());
        vi.restoreAllMocks();
    });

    test('should show the seats before the game, and start it once 3 players are seated, with the time and the money picked', async () => {
        // Given
        await table();

        // Then
        expect(element().querySelectorAll('app-eden-seat')).toHaveLength(8);
        expect(status()).toEqual('0 players seated: the game starts with 3 at least.');
        expect([text('#round'), text('#terms')]).toEqual(['', '']);
        expect(element().querySelector('#apples')).toBeNull();

        // When
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => button('Start the game') !== undefined);
        await start(['Time to vote', '30 s'], ['Starting money', '500 million']);

        // Then
        expect([text('#round'), text('#terms')]).toEqual(['Round 1 of 2 · 4 players in', 'Votes of 30 s · starting money 500 million']);
        expect(of('eve').setup()).toEqual({ voteTime: 30, startMoney: 500 });
        expect(seat(1)).toEqual('bob | 0:30 | Balance: +500 million');
        expect(text('#last-round')).toEqual('');
        expect(inMatch()).toBe(true);
    });

    test('should offer the times to vote, a minute by default, and the starting moneys, none by default', async () => {
        // When
        await seated();

        // Then
        expect(['30 s', '1 min', '2 min', '5 min'].map((option: string) => choiceFieldOption(element(), 'Time to vote', option).getAttribute('aria-checked')))
            .toEqual(['false', 'true', 'false', 'false']);
        expect(['0 million', '500 million', '1,000 million'].map((option: string) => choiceFieldOption(element(), 'Starting money', option).getAttribute('aria-checked')))
            .toEqual(['true', 'false', 'false']);

        // When
        await click('Start the game');
        await until(() => session().game() !== null);

        // Then
        expect(text('#terms')).toEqual('Votes of 1 min · starting money 0 million');
        expect(seat(0)).toEqual('alice | 1:00 | Balance: 0 million');
    });

    test('should tell the players seated wait for one of them to start, then the start the pages wait for', async () => {
        // Given
        await table();
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));

        // Then
        await until(() => status() === '3 players seated: waiting for one of them to start.');
        expect(button('Start the game')).toBeUndefined();

        // When
        hub.hold('dave');
        of('bob').start({ voteTime: 30, startMoney: 0 });

        // Then
        await until(() => status() === 'The game starts: waiting for dave.');
    });

    test('should seal the apple of the local player, then show the count kept during the next vote, and the standings', async () => {
        // Given
        await started();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When her commitment waits for the chain
        hub.hold('alice');
        await click('Gold apple');

        // Then the status waits for the others only
        await until(() => status() === 'Your apple is sealed: waiting for bob, carol, dave.');
        expect(session().awaited()).toContain('alice');

        // When the chain orders it
        hub.release();

        // Then
        await until(() => seat(0).includes('Sealed'));
        expect(text('#actions')).toEqual('Your apple, gold, is sealed');
        expect(button('Gold apple')).toBeUndefined();

        // When the reveal of Dave waits
        hub.hold('dave');
        await othersVote([RED, RED, RED]);
        await eventually(() => expect(hub.held).toHaveLength(1));
        hub.send(hub.held.splice(0, 1)[0]);

        // Then
        await until(() => status() === 'The apples are revealed…');

        // When
        hub.release();

        // Then the count shows while the next round is voted
        await until(() => session().game()?.round() === 1);
        const count = 'Round 1: 1 gold, 0 silver, 3 red. The lone gold apple of alice wins 200 million, the red ones lose 100 million';
        expect(text('#last-round')).toEqual(count);
        expect(status()).toEqual('Pick your apple, sealed: gold, silver or red.');
        expect([seat(0), seat(1)]).toEqual(['alice | 1:00 | Gold | +200 million | Balance: +200 million', 'bob | 1:00 | Red | −100 million | Balance: −100 million']);
        expect(history()).toEqual([count]);
        expect(play).toHaveBeenCalledWith(SoundEffect.POKER_CARD_TURN);

        // When
        await click('Red apple');
        await othersVote([RED, RED, RED]);

        // Then
        await until(() => session().over());
        expect(status()).toEqual('The game is over.');
        expect(text('#last-round')).toEqual('Round 2: 0 gold, 0 silver, 4 red. Only red apples: each one wins 100 million');
        expect(text('#winners')).toEqual('Winner: alice');
        expect(rows()).toEqual([
            'Winner alice In paradise +300 million',
            'Place 2 bob In paradise 0 million',
            'Place 2 carol In paradise 0 million',
            'Place 2 dave In paradise 0 million',
        ]);
        expect(seat(0)).toEqual('alice | Winner | Leave | Red | +100 million | Balance: +300 million');
        expect(text('#round')).toEqual('Round 2 of 2 · 4 players in');
        expect(text('#actions')).toEqual('Play again');
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_WON);
        expect(inMatch()).toBe(false);

        // When
        await click('Play again', element().querySelector('#actions') as HTMLElement);

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Game 1: Winner: alice, +300 million');
        expect(status()).toEqual('Pick the time to vote and the starting money, then start the game.');
    });

    test('should tell the apples revealed next once the others are sealed', async () => {
        // Given
        await started();
        await othersVote([GOLD, SILVER, RED]);
        await until(() => session().game()?.committed().length === 3);

        // When the commitment of Alice waits for the chain
        hub.hold('alice');
        await click('Silver apple');

        // Then
        await until(() => status() === 'The apples are revealed…');
        hub.release();
    });

    test('should make the lone red apple lose paradise, a spectator then, and give no winner once every player lost it', async () => {
        // Given
        await seated(Object.fromEntries(OTHERS.map((name: string) => [name, withholdingRound2])));
        await start();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        await click('Red apple');
        await othersVote([GOLD, GOLD, GOLD]);

        // Then
        await until(() => session().lostParadise());
        expect(text('#actions')).toEqual('You lost paradise: follow the rest of the game and the chat.');
        expect(seat(0)).toEqual('alice | Out | Red | −1,000 million | Balance: −1,000 million');
        expect(element().querySelector('#seat-0 .opacity-50')).not.toBeNull();
        expect(text('#round')).toEqual('Round 2 of 2 · 3 players in');
        expect(status()).toEqual('Waiting for the apples of bob, carol, dave.');
        expect(button('Red apple')).toBeUndefined();
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_LOST);
        expect(inMatch()).toBe(false);
        expect(history()).toEqual([
            'Round 1: alice loses paradise',
            'Round 1: 3 gold, 0 silver, 1 red. alice alone picked red and loses 1,000 million, the other apples win 100 million',
        ]);

        // When the others withhold their apples, the time of the reveals over
        await othersVote([GOLD, GOLD, GOLD]);
        await until(() => session().game()?.phase() === EdenPhase.REVEALING);
        hub.time = LATER;
        session().claimTimeout();

        // Then
        await until(() => session().over());
        expect(text('#winners')).toEqual('No winner: every player lost paradise');
        expect(rows()).toEqual([
            'Place 1 bob Out at round 2 −900 million',
            'Place 1 carol Out at round 2 −900 million',
            'Place 1 dave Out at round 2 −900 million',
            'Place 4 alice Out at round 1 −1,000 million',
        ]);
        expect(history().slice(0, 3)).toEqual([
            'Round 2: bob, carol, dave lose paradise',
            'Round 2: no apple counted',
            'bob, carol, dave: apple not revealed in time, −1,000 million',
        ]);

        // When
        await click('Play again');

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Game 1: No winner');
    });

    test('should let the host free the first seat, its player away, every seat taken', async () => {
        // Given Alice watches, the others take every seat, the first one last
        hub.sequencer.set('alice');
        await table();
        ['bob', 'carol', 'dave', 'eve'].forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        const more: string[] = ['fred', 'gina', 'hugo', 'ivan'];
        more.forEach((name: string, index: number) => {
            const other: Room<EdenPayloads> = hub.room(name);
            rooms.set(name, other);
            others.set(name, new EdenSession(other, { rules: LIGHT }));
            of(name).takeSeat(index === 3 ? 0 : index + 5);
        });
        await until(() => session().tableSeats.taken().length === 8);

        // When
        hub.leave(rooms.get('ivan') as Room<EdenPayloads>);
        await until(() => button('Free the seat', element().querySelector('#seat-0') as HTMLElement) !== undefined);
        await click('Free the seat', element().querySelector('#seat-0') as HTMLElement);

        // Then
        await until(() => session().tableSeats.taken().length === 7);
    });

    test('should free the seat of a player away, and leave its seat', async () => {
        // Given
        await seated();

        // When
        hub.leave(rooms.get('dave') as Room<EdenPayloads>);
        await until(() => button('Free the seat', element().querySelector('#seat-3') as HTMLElement) !== undefined);
        await click('Free the seat', element().querySelector('#seat-3') as HTMLElement);

        // Then
        await until(() => session().players().length === 3);

        // When
        await click('Leave', element().querySelector('#seat-0') as HTMLElement);

        // Then
        await until(() => session().players().length === 2);

        // When
        await click('Sit here', element().querySelector('#seat-6') as HTMLElement);

        // Then
        await until(() => session().tableSeats.mySeat() === 6);
    });

    test('should hear the seats taken', async () => {
        // Given
        await table();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);

        // Then
        await until(() => play.mock.calls.length > 0);
        expect(play).toHaveBeenCalledWith(SoundEffect.SEAT_TAKEN);
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

        test('should hurry the local player, then claim the time over, every player missing the vote', async () => {
            // Given
            await started();

            // When
            await elapse(LIGHT.defaultVoteTime - 4);

            // Then
            expect(status()).toEqual('Hurry: your time runs out!');
            expect(text('#vote-clock')).toEqual('0:04');
            expect(seat(0)).toContain('0:04');

            // When
            hub.time = LATER;
            await elapse(4);

            // Then
            await until(() => session().game()?.round() === 1);
            expect(history()).toEqual(['Round 1: no apple counted', 'alice, bob, carol, dave: no apple in time, −100 million']);
            expect(seat(0)).toEqual('alice | Late | 1:00 | −100 million | Balance: −100 million');
            expect(text('#vote-clock')).toEqual('1:00');
        });

        test('should claim nothing on a late tick of the clock of a phase closed', async () => {
            // Given the clock of the first vote
            await started();
            const component = TestHelper.cast<{ timeOut(): void; clocked: unknown }>(fixture.componentInstance);
            const clockOfTheVote: unknown = component.clocked;
            await click('Gold apple');
            await othersVote([GOLD, GOLD, GOLD]);
            await until(() => session().game()?.round() === 1);

            // When it ticks once the next vote opened, before its effect stops it
            component.clocked = clockOfTheVote;
            component.timeOut();

            // Then
            expect(hub.types()).not.toContain(GEGameSessionType.TIMEOUT);
        });

        test('should claim again a little later, its claim too early on the time of the chain', async () => {
            // Given
            await started();

            // When the time of the chain stands still
            await elapse(LIGHT.defaultVoteTime);

            // Then
            await until(() => session().voidedClaims() === 1);
            expect(text('#vote-clock')).toEqual('0:05');

            // When
            hub.time = LATER;
            await elapse(5);

            // Then
            await until(() => session().game()?.round() === 1);
        });

        test('should wait longer for a player away', async () => {
            // Given
            await started();

            // When
            hub.leave(rooms.get('dave') as Room<EdenPayloads>);

            // Then the local player to vote reads its own prompt, then the player away
            await until(() => session().awayPlayers().length === 1);
            expect(status()).toEqual('Pick your apple, sealed: gold, silver or red.');
            await click('Gold apple');
            await until(() => status() === 'Waiting for dave to come back…');
        });

        test('should wait longer for a player away during the draw', async () => {
            // Given the draw waiting for Dave
            await seated();
            hub.hold('dave');
            await click('Start the game');
            await until(() => status() === 'The game starts: waiting for dave.');

            // When
            hub.leave(rooms.get('dave') as Room<EdenPayloads>);
            await until(() => session().awayPlayers().length === 1);
            await elapse(LIGHT.drawTime - 1);

            // Then
            expect(text('#vote-clock')).toEqual(`0:${ LIGHT.awayTime + 1 }`);
        });

        test('should give no more time to a vote waiting for a player away already late, its seat late still', async () => {
            // Given Dave away, late at the first vote
            await started();
            hub.leave(rooms.get('dave') as Room<EdenPayloads>);
            await until(() => session().awayPlayers().length === 1);
            await click('Red apple');
            await othersVote([RED, RED]);
            await elapse(LIGHT.defaultVoteTime - 1);
            expect(text('#vote-clock')).toEqual(`0:${ LIGHT.awayTime + 1 }`);
            hub.time = LATER;
            await elapse(LIGHT.awayTime + 1);
            await until(() => session().game()?.round() === 1);
            expect(seat(3)).toContain('Late');

            // When the second vote waits for Dave
            await click('Red apple');
            await othersVote([RED, RED]);
            await elapse(LIGHT.defaultVoteTime - 1);

            // Then
            expect(text('#vote-clock')).toEqual('0:01');
            expect(seat(3)).toContain('Late');
        });
    });
});
