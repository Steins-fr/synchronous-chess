import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { RoomHub } from '@testing/room-hub';
import { choiceFieldOption, textFieldInput } from '@testing/text-field.helper';
import { TestHelper } from '@testing/test.helper';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MGGameSessionType, MinorityPayloads } from '../../classes/game-sessions/minority-messages';
import { MinoritySession } from '../../classes/game-sessions/minority-session';
import { MinorityPhase } from '../../classes/rules/minority-game-state';
import { MINORITY_RULES, MinorityRules, MinorityVariant, Vote } from '../../classes/rules/minority-rules';
import { MINORITY_SESSION_OPTIONS, MinorityTableComponent } from './minority-table.component';

/** Two rounds in the score variant: the specs play a game to its end quickly */
const LIGHT: MinorityRules = { ...MINORITY_RULES, rounds: 2 };
const OTHERS: ReadonlyArray<string> = ['bob', 'carol', 'dave'];
const QUESTION = 'Do you like rain?';
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;
const { YES, NO } = Vote;

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('MinorityTableComponent', { timeout: 30_000 }, () => {
    let hub: RoomHub<MinorityPayloads>;
    let fixture: ComponentFixture<MinorityTableComponent>;
    let others: Map<string, MinoritySession>;
    let rooms: Map<string, Room<MinorityPayloads>>;

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const buttons = (root: ParentNode = element()): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const button = (label: string, root?: ParentNode): HTMLButtonElement | undefined =>
        buttons(root).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);
    const of = (name: string): MinoritySession => others.get(name) as MinoritySession;
    const session = (): MinoritySession => TestHelper.cast<{ session(): MinoritySession }>(fixture.componentInstance).session();
    const history = (): ReadonlyArray<string> => fixture.componentInstance.history().map(translated);
    const rows = (): string[] => Array.from(element().querySelectorAll('#standings tbody tr'), (row: Element) =>
        Array.from(row.children, (cell: Element) => cell.textContent?.trim()).join(' '));
    /** What a seat shows, each part apart */
    const seat = (index: number): string => Array.from(element().querySelector(`#seat-${ index }`)?.children ?? [], (part: Element) => part.textContent?.trim()).join(' ');

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
        TestBed.configureTestingModule({ providers: [{ provide: MINORITY_SESSION_OPTIONS, useValue: { rules: LIGHT } }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(MinorityTableComponent);
        const room: Room<MinorityPayloads> = hub.room('alice');
        rooms.set('alice', room);
        fixture.componentRef.setInput('room', room);
        [...OTHERS, 'eve'].forEach((name: string) => {
            const other: Room<MinorityPayloads> = hub.room(name);
            rooms.set(name, other);
            others.set(name, new MinoritySession(other, { rules: LIGHT }));
        });
        await fixture.whenStable();
    }

    /** Alice takes the first seat, the others the next ones */
    async function seated(): Promise<void> {
        await table();
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => status() === 'Pick the variant and the time to vote, then start the game.');
    }

    /** Alice starts the game with the options picked: she asks the first question, the askers drawn first in their candidates */
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
        await until(() => status() === 'Ask a question answered by yes or no.');
    }

    /** Alice types her question, then asks it */
    async function ask(question: string): Promise<void> {
        const input: HTMLInputElement = textFieldInput(element(), 'Your question');
        input.value = question;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        await click('Ask');
    }

    async function asked(): Promise<void> {
        await ask(QUESTION);
        await until(() => session().game()?.phase() === MinorityPhase.VOTING);
    }

    /** Bob, Carol and Dave vote */
    async function othersVote(votes: ReadonlyArray<Vote>): Promise<void> {
        await Promise.all(votes.map((vote: Vote, index: number) => of(OTHERS[index]).vote(vote)));
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<MinorityPayloads>();
        others = new Map();
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        // The first candidate asks: Alice, then the next player
        vi.spyOn(SeededRandom.prototype, 'below').mockResolvedValue(0);
    });

    afterEach(() => {
        fixture.destroy();
        others.forEach((other: MinoritySession) => other.destroy());
        vi.restoreAllMocks();
    });

    test('should show the seats before the game, and start it once 3 players are seated, with the variant and the time picked', async () => {
        // Given
        await table();

        // Then
        expect(element().querySelectorAll('app-minority-seat')).toHaveLength(8);
        expect(status()).toEqual('0 players seated: the game starts with 3 at least.');
        expect(text('#round')).toEqual('');

        // When
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => button('Start the game') !== undefined);
        await start(['Variant', 'Score'], ['Time to vote', '30 s']);

        // Then
        expect(text('#round')).toEqual('Round 1 of 2');
        expect(text('#variant')).toEqual('Score · votes of 30 s');
        expect(element().querySelector('#stakes')).toBeNull();
        expect(of('eve').setup()).toEqual({ variant: 'score', voteTime: 30 });
        expect(text('#question h2')).toEqual('Round 1 of 2, asked by alice');
        expect(text('#seat-0')).toContain('Asks');
        expect(text('#seat-1')).toContain('0 points');
        expect(text('app-minority-seat:not(#seat-0)')).not.toContain('Asks');
    });

    test('should offer the times to vote, a minute by default, and the elimination variant', async () => {
        // When
        await seated();

        // Then
        expect(['30 s', '1 min', '2 min', '5 min'].map((option: string) => choiceFieldOption(element(), 'Time to vote', option).getAttribute('aria-checked')))
            .toEqual(['false', 'true', 'false', 'false']);

        // When
        await click('Start the game');
        await until(() => session().game() !== null);

        // Then
        expect([text('#round'), text('#variant'), text('#stakes')]).toEqual(['Question 1 · 4 players in', 'Elimination · votes of 60 s', 'Prize pool: 400 million']);
    });

    test('should tell the players seated wait for one of them to start, and the players drawing who asks', async () => {
        // Given
        await table();
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));

        // Then
        await until(() => status() === '3 players seated: waiting for one of them to start.');
        expect(button('Start the game')).toBeUndefined();

        // When
        hub.hold('dave');
        of('bob').start({ variant: MinorityVariant.ELIMINATION, voteTime: 30 });

        // Then
        await until(() => status() === 'The players draw who asks: waiting for dave.');
    });

    test('should tell the asker is drawn, until it is', async () => {
        // Given the draw of the asker waits
        vi.mocked(SeededRandom.prototype.below).mockReturnValueOnce(new Promise(() => undefined));

        // When
        await seated();
        await click('Start the game');

        // Then
        await until(() => status() === 'Drawing the player who asks…');
        expect(text('#question h2')).toEqual('');
    });

    test('should refuse a question holding a link, then show the question asked to every player, its offensive words masked', async () => {
        // Given
        await started();

        // When
        await ask('Did you see www.example.com?');

        // Then
        expect(text('mat-error')).toEqual('No link nor e-mail address in a question');
        expect(hub.types()).not.toContain(MGGameSessionType.QUESTION);

        // When
        await ask('Do you fucking care?');

        // Then
        await until(() => text('#question-text') === '“Do you f****** care?”');
        expect(text('#question h2')).toEqual('Question 1, asked by alice');
        expect(status()).toEqual('Vote yes or no, sealed.');
        expect(history()).toEqual(['Question 1, asked by alice: “Do you f****** care?”']);

        // When the setting of the chat shows them
        TestBed.inject(ChatPreferencesService).hideOffensiveWords.set(false);
        await fixture.whenStable();

        // Then
        expect(text('#question-text')).toEqual('“Do you fucking care?”');
    });

    test('should seal the vote of the local player, then show the count, the majority eliminated, and the standings', async () => {
        // Given
        await started();
        await asked();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        expect(TestHelper.cast<{ inMatch(): boolean }>(fixture.componentInstance).inMatch()).toBe(true);

        // When her commitment waits for the chain
        hub.hold('alice');
        await click('Yes');

        // Then the status waits for the others only
        await until(() => status() === 'Sealed: waiting for bob, carol, dave.');
        expect(session().awaited()).toContain('alice');

        // When the chain orders it
        hub.release();

        // Then
        await until(() => text('#seat-0').includes('Sealed'));
        expect(status()).toEqual('Sealed: waiting for bob, carol, dave.');
        expect(text('#actions')).toEqual('Your vote, yes, is sealed');

        // When the reveal of Dave waits
        hub.hold('dave');
        await othersVote([YES, YES, NO]);
        await eventually(() => expect(hub.held).toHaveLength(1));
        hub.send(hub.held.splice(0, 1)[0]);

        // Then
        await until(() => status() === 'The votes are revealed…');

        // When
        hub.release();

        // Then
        await until(() => session().over());
        expect(status()).toEqual('The game is over.');
        expect(text('#last-vote')).toEqual('Question 1: 3 yes, 1 no. Eliminated: alice, bob, carol');
        expect(text('#winners')).toEqual('Winner: dave');
        expect(rows()).toEqual([
            'Winner dave Still in 300 million',
            'Place 2 alice Out at question 1 -100 million',
            'Place 2 bob Out at question 1 -100 million',
            'Place 2 carol Out at question 1 -100 million',
        ]);
        expect(text('#seat-3')).toContain('Winner');
        expect(text('#seat-3')).toContain('No');
        expect(text('#question h2')).toEqual('Question 1, asked by alice');
        expect(text('#actions')).toEqual('Play again');
        expect(play).toHaveBeenCalledWith(SoundEffect.POKER_CARD_TURN);
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_LOST);
        expect(TestHelper.cast<{ inMatch(): boolean }>(fixture.componentInstance).inMatch()).toBe(false);

        // When
        await click('Play again');

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Game 1: Winner: dave');
        expect(status()).toEqual('Pick the variant and the time to vote, then start the game.');
    });

    test('should count the length of a question without its spaces around, and tell the votes revealed next once the others are sealed', async () => {
        // Given
        await started();

        // When
        await ask('a'.repeat(121));

        // Then
        expect(text('mat-error')).toEqual('120 characters at most');

        // When
        await ask(`  ${ 'a'.repeat(120) }  `);

        // Then
        await until(() => text('#question-text') === `“${ 'a'.repeat(120) }”`);

        // When the others are sealed, the commitment of Alice waiting for the chain
        await othersVote([YES, YES, NO]);
        await until(() => session().game()?.committed().length === 3);
        hub.hold('alice');
        await click('No');

        // Then
        await until(() => status() === 'The votes are revealed…');
        hub.release();
    });

    test('should tell a tie, then a new question of another player', async () => {
        // Given
        await started();
        await asked();

        // When
        await click('No');
        await othersVote([YES, NO, YES]);

        // Then
        await until(() => status() === 'bob asks a question…');
        expect(text('#last-vote')).toEqual('Question 1: 2 yes, 2 no. Nobody eliminated: a new question');
        expect(text('#round')).toEqual('Question 2 · 4 players in');
        expect([seat(0), seat(1)]).toEqual(['alice No', 'bob Asks Yes 1:00']);
        expect(history()[0]).toEqual('Question 1: 2 yes, 2 no. Nobody eliminated: a new question');

        // When
        of('bob').ask('Is it late?');

        // Then the count of the question before hides
        await until(() => text('#question-text') === '“Is it late?”');
        expect(text('#last-vote')).toEqual('');
        expect(seat(1)).toEqual('bob Asks 1:00');

        // When another tie gives the question back to Alice
        await click('No');
        await othersVote([YES, NO, YES]);

        // Then her form is new, without an error before she types
        await until(() => status() === 'Ask a question answered by yes or no.');
        expect(textFieldInput(element(), 'Your question').value).toEqual('');
        expect(element().querySelector('mat-error')).toBeNull();
    });

    test('should make the local player eliminated a spectator of the rest of the game', async () => {
        // Given
        await started();
        await asked();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        await othersVote([YES, YES, YES]);
        await until(() => session().game()?.committed().length === 3);

        // When the time of the vote is over, Alice not voting
        hub.time = LATER;
        of('bob').claimTimeout();

        // Then
        await until(() => session().eliminated());
        expect(text('#actions')).toEqual('You are eliminated: follow the rest of the game and the chat.');
        expect(text('#seat-0')).toContain('Eliminated');
        expect(text('#seat-0')).not.toContain('Skipped');
        expect(element().querySelector('#seat-0 .opacity-50')).not.toBeNull();
        expect(text('#round')).toEqual('Question 2 · 3 players in');
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_LOST);
        expect(TestHelper.cast<{ inMatch(): boolean }>(fixture.componentInstance).inMatch()).toBe(false);
        expect(history()).toEqual(['Question 1: 3 yes, 0 no. Eliminated: alice', 'alice: no vote in time', 'Question 1, asked by alice: “Do you like rain?”']);

        // When
        of('bob').ask('Is it late?');

        // Then
        await until(() => status() === 'Waiting for the votes of bob, carol, dave.');
        expect(button('Yes')).toBeUndefined();
    });

    test('should count the points of the minority over the rounds, then the standings by points', async () => {
        // Given
        await started(['Variant', 'Score']);
        await asked();

        // When
        await click('Yes');
        await othersVote([YES, NO, NO]);

        // Then
        await until(() => status() === 'bob asks a question…');
        expect(text('#last-vote')).toEqual('Round 1: 2 yes, 2 no. Nobody scores');
        expect(text('#round')).toEqual('Round 2 of 2');

        // When
        of('bob').ask('Is it late?');
        await until(() => status() === 'Vote yes or no, sealed.');
        await click('Yes');
        await othersVote([YES, YES, NO]);

        // Then
        await until(() => session().over());
        expect(text('#last-vote')).toEqual('Round 2: 3 yes, 1 no. Points: dave +3');
        expect(text('#round')).toEqual('Round 2 of 2');
        expect(text('#winners')).toEqual('Winner: dave');
        expect(rows()).toEqual(['Winner dave 3 points', 'Place 2 alice 0 points', 'Place 2 bob 0 points', 'Place 2 carol 0 points']);
        expect(element().querySelectorAll('#standings th')).toHaveLength(3);
        expect(text('#seat-3')).toContain('3 points');

        // When
        await click('Play again');

        // Then
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Game 1: First place, 3 points: dave');
    });

    test('should let the host free the first seat, its player away, every seat taken', async () => {
        // Given Alice watches, the others take every seat, the first one last
        hub.sequencer.set('alice');
        await table();
        ['bob', 'carol', 'dave', 'eve'].forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        const more: string[] = ['fred', 'gina', 'hugo', 'ivan'];
        more.forEach((name: string, index: number) => {
            const other: Room<MinorityPayloads> = hub.room(name);
            rooms.set(name, other);
            others.set(name, new MinoritySession(other, { rules: LIGHT }));
            of(name).takeSeat(index === 3 ? 0 : index + 5);
        });
        await until(() => session().tableSeats.taken().length === 8);

        // When
        hub.leave(rooms.get('ivan') as Room<MinorityPayloads>);
        await until(() => button('Free the seat', element().querySelector('#seat-0') as HTMLElement) !== undefined);
        await click('Free the seat', element().querySelector('#seat-0') as HTMLElement);

        // Then
        await until(() => session().tableSeats.taken().length === 7);
    });

    test('should free the seat of a player away, and leave its seat', async () => {
        // Given
        await seated();

        // When
        hub.leave(rooms.get('dave') as Room<MinorityPayloads>);
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

    test('should hear the seats taken and the questions asked, nothing while catching up', async () => {
        // Given
        await table();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        await click('Sit here', element().querySelector('#seat-0') as HTMLElement);
        OTHERS.forEach((name: string, index: number) => of(name).takeSeat(index + 1));
        await until(() => button('Start the game') !== undefined);
        await click('Start the game');
        await until(() => status() === 'Ask a question answered by yes or no.');
        await asked();

        // Then
        expect(play).toHaveBeenCalledWith(SoundEffect.SEAT_TAKEN);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHESS_TURN_START);
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

        test('should hurry the local player, then claim the time over, another player asking', async () => {
            // Given
            await started();

            // When
            await elapse(LIGHT.questionTime - 4);

            // Then
            expect(status()).toEqual('Hurry: your time runs out!');
            expect(text('#vote-clock')).toEqual('0:04');
            expect(text('#seat-0')).toContain('0:04');

            // When
            hub.time = LATER;
            await elapse(4);

            // Then
            await until(() => status() === 'bob asks a question…');
            expect(history()).toEqual(['Question 1: alice did not ask in time, another player asks']);
            expect(text('#seat-0')).toContain('Skipped');
            expect(text('#vote-clock')).toEqual('1:00');
        });

        test('should claim nothing on a late tick of the clock of a phase closed', async () => {
            // Given the clock of the question
            await started();
            const component = TestHelper.cast<{ timeOut(): void; clocked: unknown }>(fixture.componentInstance);
            const clockOfTheQuestion: unknown = component.clocked;
            await asked();

            // When it ticks once the vote opened, before its effect stops it
            component.clocked = clockOfTheQuestion;
            component.timeOut();

            // Then
            expect(hub.types()).not.toContain(MGGameSessionType.TIMEOUT);
        });

        test('should close the vote once its time is over, nobody voting: every player eliminated, no winner', async () => {
            // Given
            hub.time = 0;
            await started();
            await asked();

            // When
            hub.time = LATER;
            await elapse(60);

            // Then
            await until(() => session().over());
            expect(text('#winners')).toEqual('No winner: every player left was eliminated');
            expect(rows()).toEqual([
                'Place 1 alice Out at question 1 -100 million',
                'Place 1 bob Out at question 1 -100 million',
                'Place 1 carol Out at question 1 -100 million',
                'Place 1 dave Out at question 1 -100 million',
            ]);

            // When
            await click('Play again');

            // Then
            await until(() => fixture.componentInstance.pastResults().length === 1);
            expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Game 1: No winner');
        });

        test('should claim again a little later, its claim too early on the time of the chain', async () => {
            // Given
            await started();

            // When the time of the chain stands still
            await elapse(LIGHT.questionTime);

            // Then
            await until(() => session().voidedClaims() === 1);
            expect(text('#vote-clock')).toEqual('0:05');

            // When
            hub.time = LATER;
            await elapse(5);

            // Then
            await until(() => status() === 'bob asks a question…');
        });

        test('should wait longer for a player away', async () => {
            // Given
            await started();
            await asked();

            // When
            hub.leave(rooms.get('dave') as Room<MinorityPayloads>);

            // Then the local player to vote reads its own prompt, then the player away
            await until(() => session().awayPlayers().length === 1);
            expect(status()).toEqual('Vote yes or no, sealed.');
            await click('Yes');
            await until(() => status() === 'Waiting for dave to come back…');
        });
    });
});
