import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';
import { ChipFlightsComponent } from '@app/modules/game-table/components/chip-flights/chip-flights.component';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { PrivatePayloads } from '@app/modules/private-conversations/classes/private-messages';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { RoomHub } from '@testing/room-hub';
import { choiceFieldOption, numberFieldInput } from '@testing/text-field.helper';
import { TestHelper } from '@testing/test.helper';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CBGameSessionType, ContrabandPayloads } from '../../classes/game-sessions/contraband-messages';
import { ContrabandSession } from '../../classes/game-sessions/contraband-session';
import { Applied, ContrabandGameState, ContrabandPhase } from '../../classes/rules/contraband-game-state';
import { Call, CallKind, CONTRABAND_RULES, ContrabandRules, ContrabandVariant } from '../../classes/rules/contraband-rules';
import { CONTRABAND_SESSION_OPTIONS, ContrabandTableComponent } from './contraband-table.component';

type Payloads = ContrabandPayloads & PrivatePayloads;

/** Four games a match: the specs play one to its end quickly */
const LIGHT: ContrabandRules = { ...CONTRABAND_RULES, gameCounts: [4], defaultGames: 4 };
/** The seats of the others: Bob of the North, Carol and Dave of the South */
const OTHERS: ReadonlyArray<[string, number]> = [['bob', 1], ['carol', 4], ['dave', 5]];
const PASS: Call = { kind: CallKind.PASS };
const CHECK: Call = { kind: CallKind.CHECK };
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('ContrabandTableComponent', { timeout: 30_000 }, () => {
    let hub: RoomHub<Payloads>;
    let fixture: ComponentFixture<ContrabandTableComponent>;
    let others: Map<string, ContrabandSession>;
    let rooms: Map<string, Room<Payloads>>;

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const seat = (index: number): HTMLElement => element().querySelector(`#seat-${ index }`) as HTMLElement;
    const buttons = (root: ParentNode = element()): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const button = (label: string, root?: ParentNode): HTMLButtonElement | undefined =>
        buttons(root).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);
    const of = (name: string): ContrabandSession => others.get(name) as ContrabandSession;
    const session = (): ContrabandSession => TestHelper.cast<{ session(): ContrabandSession }>(fixture.componentInstance).session();
    const phase = (): ContrabandPhase | undefined => session().game()?.phase();
    const history = (): ReadonlyArray<string> => fixture.componentInstance.history().map(translated);
    const rows = (): string[] => Array.from(element().querySelectorAll('#standings tbody tr'), (row: Element) =>
        Array.from(row.children, (cell: Element) => cell.textContent?.trim()).join(' '));
    const inMatch = (): boolean => TestHelper.cast<{ inMatch(): boolean }>(fixture.componentInstance).inMatch();
    const flights = (): ChipFlightsComponent => TestHelper.cast<{ chipFlights(): ChipFlightsComponent }>(fixture.componentInstance).chipFlights();
    const conversations = (): ReadonlyArray<Readonly<PrivateConversation>> => fixture.componentInstance.conversations().conversations();

    async function until(check: () => boolean): Promise<void> {
        await eventually(async () => {
            await fixture.whenStable();
            expect(check(), `status: ${ status() } | phase: ${ phase() } | awaited: ${ session().awaited() } | held: ${ hub.held.map(({ from, type }) => `${ from } ${ type }`) }`).toBe(true);
        });
        // The table shows what the check read
        await fixture.whenStable();
    }

    async function click(label: string, root?: ParentNode): Promise<void> {
        (button(label, root) as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    async function type(label: string, value: string): Promise<void> {
        const input: HTMLInputElement = numberFieldInput(element(), label);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
    }

    function page(name: string, rules: ContrabandRules): void {
        const other: Room<Payloads> = hub.room(name);
        rooms.set(name, other);
        others.set(name, new ContrabandSession(other, { rules }));
    }

    /** The table of Alice in the room, Bob, Carol, Dave and Eve on their pages */
    async function table(rules: ContrabandRules = LIGHT): Promise<void> {
        TestBed.configureTestingModule({ providers: [{ provide: CONTRABAND_SESSION_OPTIONS, useValue: { rules } }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(ContrabandTableComponent);
        const room: Room<Payloads> = hub.room('alice');
        rooms.set('alice', room);
        fixture.componentRef.setInput('room', room);
        ['bob', 'carol', 'dave', 'eve'].forEach((name: string) => page(name, rules));
        await fixture.whenStable();
    }

    /** Alice takes the first seat of the North, the others their seats: two countries of 2 players */
    async function seated(rules?: ContrabandRules): Promise<void> {
        await table(rules);
        await click('Sit here', seat(0));
        OTHERS.forEach(([name, index]: [string, number]) => of(name).takeSeat(index));
        await until(() => status() === 'Pick the variant, the customs and the games, then start.');
    }

    /** Alice starts the match with the options picked: she smuggles first, Carol inspects */
    async function started(picked: ReadonlyArray<[string, string]> = [], rules?: ContrabandRules): Promise<void> {
        await seated(rules);
        for (const [label, option] of picked) {
            choiceFieldOption(element(), label, option).click();
            await fixture.whenStable();
        }
        await click('Start the game');
        await until(() => status() === 'Pack your trunk: it stays sealed until the call.');
    }

    /** The smuggler of the game, another page, packs: the customs open */
    async function packedBy(name: string, amount: number): Promise<void> {
        await eventually(() => expect(of(name).canPack()).toBe(true));
        await of(name).pack(amount);
        await until(() => phase() === ContrabandPhase.CUSTOMS);
    }

    /** The inspector of the game, another page, calls: the trunk is revealed, the next game opens */
    async function calledBy(name: string, call: Call): Promise<void> {
        const step: number = session().step();
        await eventually(() => expect(of(name).canCall()).toBe(true));
        of(name).call(call);
        await until(() => session().step() > step + 1);
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<Payloads>();
        others = new Map();
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        // The pairs in the order of the seats: Alice and Carol, then Bob and Dave
        vi.spyOn(SeededRandom.prototype, 'shuffle').mockImplementation(<T>(items: ReadonlyArray<T>) => Promise.resolve([...items]));
    });

    afterEach(() => {
        fixture.destroy();
        others.forEach((other: ContrabandSession) => other.destroy());
        vi.restoreAllMocks();
    });

    test('should show both countries before the match, and start it once they hold as many players, with the setup picked', async () => {
        // Given
        await table();

        // Then the North below for a spectator, the first free seat being of the North
        expect(element().querySelectorAll('app-contraband-seat')).toHaveLength(8);
        expect(Array.from(element().querySelectorAll('[id^="team-"]'), (team: Element) => team.id)).toEqual(['team-south', 'team-north']);
        expect(text('#team-north h2')).toEqual('Northern country');
        expect(status()).toEqual('Northern country: 0, Southern country: 0. The match needs as many players in each, 1 at least.');
        expect(element().querySelector('#crossing')).toBeNull();

        // When
        await click('Sit here', seat(0));
        of('bob').takeSeat(1);
        of('carol').takeSeat(4);

        // Then
        await until(() => status() === 'Northern country: 2, Southern country: 1. The match needs as many players in each, 1 at least.');

        // When
        of('dave').takeSeat(5);
        await until(() => button('Start the game') !== undefined);
        choiceFieldOption(element(), 'Variant', 'Gold Rush').click();
        choiceFieldOption(element(), 'Customs', '1 min').click();
        await fixture.whenStable();
        expect(choiceFieldOption(element(), 'Games', '4 games').getAttribute('aria-checked')).toEqual('true');
        await click('Start the game');
        await until(() => status() === 'Pack your trunk: it stays sealed until the call.');

        // Then
        expect(of('eve').setup()).toEqual({ variant: 'goldRush', customsTime: 60, games: 4 });
        expect([text('#crossing'), text('#variant')]).toEqual(['Game 1 of 4', 'Gold Rush · customs of 1 min']);
        expect([text('#smuggler'), text('#inspector'), text('#trunk')]).toEqual(['Smuggler: alice', 'Inspector: carol', 'Packing…']);
        expect(text('#team-north h2')).toEqual('Northern country ATMs: 600 million');
        expect(text('#seat-0')).toContain('Smuggler');
        expect(text('#seat-4')).toContain('Inspector');
        expect(text('#seat-1')).toContain('ATM: 300 million');
        expect(text('#seat-1')).toContain('Account: 100 million');
        expect(text('#seat-1')).not.toContain('Smuggler');
        expect([button('Gold bar')?.disabled, button('Iron bar')?.disabled]).toEqual([false, false]);
        expect(inMatch()).toBe(true);
    });

    test('should tell the players seated wait for one of them to start, then the draw of the pairs', async () => {
        // Given
        await table();
        of('bob').takeSeat(1);
        of('carol').takeSeat(4);

        // Then
        await until(() => status() === '2 players seated: waiting for one of them to start.');
        expect(button('Start the game')).toBeUndefined();

        // When
        hub.hold('carol');
        await eventually(() => expect(of('bob').canStart()).toBe(true));
        of('bob').start({ variant: ContrabandVariant.CLASSIC, customsTime: 120, games: 4 });

        // Then
        await until(() => status() === 'The players draw the pairs: waiting for carol.');
        expect(text('#seat-4')).not.toContain('ATM');
        hub.release();
    });

    test('should seal the trunk the smuggler types, then settle it once called, its chips flying to the accounts', async () => {
        // Given
        await started();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const launch = vi.spyOn(flights(), 'launch');

        // When
        await type('Trunk (millions)', '');
        await click('Pack the trunk');

        // Then
        expect(text('mat-error')).toEqual('Type the money of your trunk');

        // When
        await type('Trunk (millions)', '101');
        await click('Pack the trunk');

        // Then
        expect(text('mat-error')).toEqual('At most 100 million');

        // When
        await type('Trunk (millions)', '-1');
        await click('Pack the trunk');

        // Then
        expect(text('mat-error')).toEqual('0 million at least');

        // When
        await type('Trunk (millions)', '2.5');
        await click('Pack the trunk');

        // Then
        expect(text('mat-error')).toEqual('Pack whole millions');
        expect(hub.types()).not.toContain(CBGameSessionType.COMMIT);

        // When its commitment waits for the chain
        hub.hold('alice');
        await type('Trunk (millions)', '40');
        await click('Pack the trunk');

        // Then
        await until(() => status() === 'Your trunk is sealed: the customs open…');
        expect(text('#actions')).toEqual('Your trunk holds 40 million, sealed');

        // When
        hub.release();

        // Then
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        expect(status()).toEqual('carol inspects the trunk of alice…');
        expect(text('#trunk')).toEqual('Sealed');
        expect(text('#actions')).toEqual('Your trunk holds 40 million, sealed');
        expect(of('carol').myTrunk()).toBeNull();
        expect(conversations().map((conversation: Readonly<PrivateConversation>) => [conversation.id, conversation.open]))
            .toEqual([['cb-0-0-north', true], ['cb-0-0-south', true], ['cb-0-0-customs-0', true]]);

        // When the reveal of Alice waits
        hub.hold('alice');
        await eventually(() => expect(of('carol').canCall()).toBe(true));
        of('carol').call({ kind: CallKind.DOUBT, amount: 30 });

        // Then
        await until(() => status() === 'The trunk is revealed…');

        // When
        hub.release();

        // Then
        await until(() => phase() === ContrabandPhase.PACKING && session().game()?.crossing() === 1);
        expect(text('#last-crossing')).toEqual('Game 1: carol doubts 30 million, alice smuggles 40 million and receives 15 million');
        expect(status()).toEqual('carol packs a trunk…');
        expect(text('#seat-0')).toContain('Inspector');
        expect(text('#seat-0')).toContain('ATM: 260 million');
        expect(text('#seat-0')).toContain('Account: 155 million');
        expect(text('#seat-4')).toContain('Account: 85 million');
        expect(launch).toHaveBeenCalledWith([expect.objectContaining({ amount: 40 }), expect.objectContaining({ amount: 15 })]);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHESS_TURN_START);
        expect(play).toHaveBeenCalledWith(SoundEffect.POKER_CARD_TURN);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS);
        expect(history()).toEqual(['Game 1: carol doubts 30 million, alice smuggles 40 million and receives 15 million']);
        expect(conversations().at(-1)?.open).toBe(false);
    });

    test('should let the inspector doubt an amount, half a million moving no chip', async () => {
        // Given Carol smuggles in the second game, Alice inspects
        await started();
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        await calledBy('carol', PASS);
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const launch = vi.spyOn(flights(), 'launch');
        await packedBy('carol', 0);
        expect(status()).toEqual('Pass, or doubt an amount.');

        // When
        await click('Doubt');

        // Then
        expect(text('mat-error')).toEqual('Type the amount you doubt');

        // When
        await type('Doubt (millions)', '101');
        await click('Doubt');

        // Then
        expect(text('mat-error')).toEqual('At most 100 million');

        // When
        await type('Doubt (millions)', '0');
        await click('Doubt');

        // Then
        expect(text('mat-error')).toEqual('1 million at least');

        // When
        await type('Doubt (millions)', '1.5');
        await click('Doubt');

        // Then
        expect(text('mat-error')).toEqual('Doubt whole millions');
        expect(hub.delivered.filter(({ from, type }) => from === 'alice' && type === CBGameSessionType.CALL)).toEqual([]);

        // When
        await type('Doubt (millions)', '1');
        await click('Doubt');

        // Then
        await until(() => session().game()?.crossing() === 2);
        expect(text('#last-crossing')).toEqual('Game 2: alice doubts 1 million of an empty trunk, and pays carol 0.5 million');
        expect(text('#seat-4')).toContain('Account: 100.5 million');
        expect(launch).not.toHaveBeenCalled();
        expect(play).not.toHaveBeenCalledWith(SoundEffect.CHIPS);
        expect(status()).toEqual('bob packs a trunk…');
    });

    test('should play a match to its end, then show its standings and start another one', async () => {
        // Given
        await started();
        await type('Trunk (millions)', '40');
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        await calledBy('carol', { kind: CallKind.DOUBT, amount: 30 });
        await packedBy('carol', 0);
        await click('Pass');
        await until(() => session().game()?.crossing() === 2);
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        await packedBy('bob', 100);
        await calledBy('dave', PASS);
        await packedBy('dave', 0);
        await calledBy('bob', PASS);

        // Then
        await until(() => session().over());
        expect(status()).toEqual('The match is over.');
        expect(text('#trunk')).toEqual('Empty');
        expect(text('#winners')).toEqual('The Northern country wins by 310 million');
        expect(rows()).toEqual([
            'alice North 40 0 +15 300 +55',
            'bob North 100 0 0 300 +100',
            'carol South 0 0 −15 230 −85',
            'dave South 0 0 0 230 −70',
        ]);
        expect(text('#seat-1')).toContain('+100 million');
        expect(seat(1).querySelector('.badge-win')).not.toBeNull();
        expect(seat(4).querySelector('.badge-draw')?.textContent?.trim()).toEqual('−85 million');
        expect(text('#seat-0')).not.toContain('Smuggler');
        expect(text('#actions')).toEqual('Play again');
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_WON);
        expect(inMatch()).toBe(false);
        expect(history()).toHaveLength(4);
        expect(conversations().every((conversation: Readonly<PrivateConversation>) => !conversation.open)).toBe(true);

        // When Eve takes a seat left free, out of the match over
        await eventually(() => expect(of('eve').tableSeats.canTake(2)).toBe(true));
        of('eve').takeSeat(2);

        // Then
        await until(() => text('#seat-2').startsWith('eve'));
        expect(text('#seat-2')).not.toContain('ATM');
        const totals: ReadonlyArray<string> = [text('#team-north h2'), text('#team-south h2')];

        // When Bob, of the North, sits in the South for the next match
        of('bob').leaveSeat();
        await until(() => !text('#seat-1').startsWith('bob'));
        of('bob').takeSeat(6);

        // Then his money stays out of the South, his ATM in the total of the North
        await until(() => text('#seat-6').startsWith('bob'));
        expect(text('#seat-6')).not.toContain('ATM');
        expect(seat(6).querySelector('.badge-win')).toBeNull();
        expect([text('#team-north h2'), text('#team-south h2')]).toEqual(totals);

        // When
        await click('Play again');

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Match 1: The Northern country wins by 310 million');
        expect(status()).toEqual('Northern country: 2, Southern country: 3. The match needs as many players in each, 1 at least.');
        expect(element().querySelector('#customs')).toBeNull();
        expect(conversations()).toEqual([]);
    });

    test('should tell a tie, a match whose last trunk was never packed', async () => {
        // Given every trunk empty and passed but the last one
        await started();
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        await calledBy('carol', PASS);
        await packedBy('carol', 0);
        await click('Pass');
        await until(() => session().game()?.crossing() === 2);
        await packedBy('bob', 0);
        await calledBy('dave', PASS);

        // When Dave packs nothing in time
        await eventually(() => expect(of('bob').awaited()).toEqual(['dave']));
        hub.time = LATER;
        of('bob').claimTimeout();

        // Then
        await until(() => session().over());
        expect(text('#trunk')).toEqual('No trunk');
        expect(text('#last-crossing')).toEqual('Game 4: dave packs no trunk in time, nothing moves');
        expect(text('#winners')).toEqual('A tie: each player keeps its balance');
        expect(text('#seat-0')).toContain('0 million');
        expect(rows()[0]).toEqual('alice North 0 0 0 300 0');

        // When
        await click('Play again');

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Match 1: A tie: each player keeps its balance');
    });

    test('should seize the last trunk of a match, not revealed in time', async () => {
        // Given a match of 2 games, Carol packing the second one, Alice passing it
        await started([], { ...LIGHT, gameCounts: [2], defaultGames: 2 });
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        await calledBy('carol', PASS);
        await packedBy('carol', 0);
        hub.hold('carol');
        await click('Pass');
        await until(() => status() === 'The trunk is revealed…');

        // When the time of the reveal is over
        hub.time = LATER;
        session().claimTimeout();

        // Then
        await until(() => session().over());
        expect(text('#trunk')).toEqual('Not revealed');
        expect(text('#last-crossing')).toEqual('Game 2: the trunk of carol is not revealed in time, alice seizes 100 million');
        // Seized or left in the ATM of Carol, the money goes to the North all the same
        expect(text('#winners')).toEqual('A tie: each player keeps its balance');
        hub.release();
    });

    describe('the Gold Rush', () => {
        test('should pack a gold bar, sealed, the inspector checking it seizing the bar', async () => {
            // Given
            await started([['Variant', 'Gold Rush']]);
            const launch = vi.spyOn(flights(), 'launch');

            // When
            hub.hold('alice');
            await click('Gold bar');

            // Then
            await until(() => text('#actions') === 'Your trunk holds a gold bar, sealed');

            // When
            hub.release();
            await until(() => phase() === ContrabandPhase.CUSTOMS);
            await calledBy('carol', CHECK);

            // Then
            expect(text('#last-crossing')).toEqual('Game 1: carol checks and seizes 100 million from alice');
            expect(launch).toHaveBeenCalledWith([expect.objectContaining({ amount: 100 })]);

            // When Carol packs, Alice inspects
            await packedBy('carol', 100);

            // Then
            expect(status()).toEqual('Pass, or check the trunk.');
            expect(button('Doubt')).toBeUndefined();

            // When
            await click('Check');

            // Then
            await until(() => session().game()?.crossing() === 2);
            expect(text('#last-crossing')).toEqual('Game 2: alice checks and seizes 100 million from carol');
        });

        test('should leave an iron bar only once the ATM holds no gold bar, the inspector checking it paying one', async () => {
            // Given an ATM below a gold bar
            await started([['Variant', 'Gold Rush']], { ...LIGHT, atm: 50 });
            const launch = vi.spyOn(flights(), 'launch');

            // Then
            expect(button('Gold bar')?.disabled).toBe(true);

            // When
            hub.hold('alice');
            await click('Iron bar');

            // Then
            await until(() => text('#actions') === 'Your trunk holds an iron bar, sealed');

            // When
            hub.release();
            await until(() => phase() === ContrabandPhase.CUSTOMS);
            await calledBy('carol', CHECK);

            // Then
            expect(text('#last-crossing')).toEqual('Game 1: carol checks an iron bar, and pays alice 100 million');
            expect(launch).toHaveBeenCalledWith([expect.objectContaining({ amount: 100 })]);
        });
    });

    test('should hear the money moved, without its flights, on a page hidden', async () => {
        // Given
        await started();
        await type('Trunk (millions)', '10');
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const launch = vi.spyOn(flights(), 'launch');

        // When
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await calledBy('carol', PASS);

        // Then
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS);
        expect(launch).not.toHaveBeenCalled();
    });

    test('should hear the chips of the last game, without their flight, its smuggler gone from its seat before the table shows it', async () => {
        // Given the last game of the match, Dave smuggling 10 million
        await started();
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);
        await calledBy('carol', PASS);
        await packedBy('carol', 0);
        await click('Pass');
        await until(() => session().game()?.crossing() === 2);
        await packedBy('bob', 0);
        await calledBy('dave', PASS);
        await packedBy('dave', 10);
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const launch = vi.spyOn(flights(), 'launch');
        // Dave leaves his seat as the match is over, in the same turn as his reveal
        const game: ContrabandGameState = session().game() as ContrabandGameState;
        const reveal: ContrabandGameState['reveal'] = game.reveal.bind(game);
        vi.spyOn(game, 'reveal').mockImplementation((player: number, contents: unknown): Applied => {
            const applied: Applied = reveal(player, contents);
            session().tableSeats.free(5);
            return applied;
        });

        // When
        await calledBy('bob', PASS);

        // Then
        await until(() => session().over());
        expect(text('#seat-5')).not.toContain('dave');
        expect(text('#last-crossing')).toEqual('Game 4: bob lets dave pass, 10 million smuggled');
        expect(launch).toHaveBeenCalledWith([]);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS);
    });

    test('should hear the seats taken and the customs open, nothing while catching up', async () => {
        // Given
        await table();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        await click('Sit here', seat(0));
        OTHERS.forEach(([name, index]: [string, number]) => of(name).takeSeat(index));
        await until(() => button('Start the game') !== undefined);
        await click('Start the game');
        await until(() => status() === 'Pack your trunk: it stays sealed until the call.');
        await click('Pack the trunk');
        await until(() => phase() === ContrabandPhase.CUSTOMS);

        // Then
        expect(play).toHaveBeenCalledWith(SoundEffect.SEAT_TAKEN);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHESS_TURN_START);
    });

    test('should let the host free a seat of a player away, and a player leave its seat for the South', async () => {
        // Given
        await seated();

        // When
        hub.leave(rooms.get('dave') as Room<Payloads>);
        await until(() => button('Free the seat', seat(5)) !== undefined);
        await click('Free the seat', seat(5));

        // Then
        await until(() => session().players().length === 3);

        // When
        await click('Leave', seat(0));
        await until(() => session().players().length === 2);
        await click('Sit here', seat(6));

        // Then the South below
        await until(() => session().tableSeats.mySeat() === 6);
        expect(Array.from(element().querySelectorAll('[id^="team-"]'), (team: Element) => team.id)).toEqual(['team-north', 'team-south']);
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

        test('should hurry the local player, then claim the time over, its trunk not packed', async () => {
            // Given
            await started();

            // When
            await elapse(LIGHT.packingTime - 4);

            // Then
            expect(status()).toEqual('Hurry: your time runs out!');
            expect(text('#clock')).toEqual('0:04');
            expect(text('#seat-0')).toContain('0:04');

            // When
            hub.time = LATER;
            await elapse(4);

            // Then
            await until(() => status() === 'carol packs a trunk…');
            expect(history()).toEqual(['Game 1: alice packs no trunk in time, nothing moves']);
            expect(text('#seat-0')).toContain('Late');
            expect(text('#clock')).toEqual('1:00');
        });

        test('should claim nothing on a late tick of the clock of a phase closed', async () => {
            // Given the clock of the packing
            await started();
            const component = TestHelper.cast<{ timeOut(): void; clocked: unknown }>(fixture.componentInstance);
            const clockOfThePacking: unknown = component.clocked;
            await click('Pack the trunk');
            await until(() => phase() === ContrabandPhase.CUSTOMS);

            // When it ticks once the customs opened, before its effect stops it
            component.clocked = clockOfThePacking;
            component.timeOut();

            // Then
            expect(hub.types()).not.toContain(CBGameSessionType.TIMEOUT);
        });

        test('should claim again a little later, its claim too early on the time of the chain', async () => {
            // Given
            await started();

            // When the time of the chain stands still
            await elapse(LIGHT.packingTime);

            // Then
            await until(() => session().voidedClaims() === 1);
            expect(text('#clock')).toEqual('0:05');

            // When
            hub.time = LATER;
            await elapse(5);

            // Then
            await until(() => status() === 'carol packs a trunk…');
        });

        test('should wait longer for a player away, once only after the phase it missed', async () => {
            // Given Carol inspects, away
            await started();
            await click('Pack the trunk');
            await until(() => phase() === ContrabandPhase.CUSTOMS);

            // When
            hub.leave(rooms.get('carol') as Room<Payloads>);

            // Then
            await until(() => status() === 'Waiting for carol to come back…');
            await elapse(LIGHT.defaultCustomsTime - 1);
            expect(text('#clock')).toEqual(`0:${ LIGHT.awayTime + 1 }`);

            // When the customs close, Carol late
            hub.time = LATER;
            await elapse(LIGHT.awayTime + 1);
            await until(() => phase() === ContrabandPhase.PACKING);
            expect(text('#seat-4')).toContain('Late');
            expect(text('#last-crossing')).toEqual('Game 1: carol does not call in time and lets alice pass, 0 million smuggled');

            // Then the packing of Carol, absent, gets no more time
            await elapse(LIGHT.packingTime - 1);
            expect(text('#clock')).toEqual('0:01');
        });
    });
});
