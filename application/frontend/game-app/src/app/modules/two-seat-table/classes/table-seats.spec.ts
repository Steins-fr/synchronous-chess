import { signal, WritableSignal } from '@angular/core';
import { TableSeat } from '@app/helpers/seat-pair.helper';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomHub } from '@testing/room-hub';
import { beforeEach, describe, expect, test } from 'vitest';
import { SeatPayloads, TableSeats } from './table-seats';

type Payloads = SeatPayloads<'seat', 'unseat'>;

const { ONE, TWO } = TableSeat;

describe('TableSeats', () => {
    let hub: RoomHub<Payloads>;
    let rooms: Map<string, Room<Payloads>>;
    let open: WritableSignal<boolean>;
    let sending: WritableSignal<boolean>;
    /** What each page told of the messages of the seats it applied */
    let applied: Array<[string, string, boolean]>;

    /** A participant on the page of the table, applying the messages of the seats in the order of the chain */
    function page(name: string): TableSeats<'seat', 'unseat'> {
        const room: Room<Payloads> = hub.room(name);
        const seats = new TableSeats(room, { types: { seat: 'seat', unseat: 'unseat' }, open, sending });
        room.messenger('seat').subscribe((message) => applied.push([name, message.type, seats.onSeat(message)]));
        room.messenger('unseat').subscribe((message) => applied.push([name, message.type, seats.onUnseat(message)]));
        rooms.set(name, room);
        return seats;
    }

    beforeEach(() => {
        hub = new RoomHub<Payloads>();
        rooms = new Map();
        open = signal(true);
        sending = signal(false);
        applied = [];
    });

    test('should seat the first participant asking for a free seat, each one on a single seat, with its salt', () => {
        // Given
        const alice = page('alice');
        const bob = page('bob');
        const carol = page('carol');

        // When
        alice.takeSeat(TWO);
        bob.takeSeat(TWO);
        bob.takeSeat(ONE);
        alice.takeSeat(ONE);

        // Then
        expect(carol.seats()).toEqual(['bob', 'alice']);
        expect(carol.seated().map((seated) => seated?.salt)).toEqual([expect.stringMatching(/^[0-9a-f]{32}$/), expect.stringMatching(/^[0-9a-f]{32}$/)]);
        expect([alice.mySeat(), bob.mySeat(), carol.mySeat()]).toEqual([TWO, ONE, null]);
        expect(carol.seatOf('alice')).toEqual(TWO);
        expect(carol.spectatorNumber()).toEqual(1);
        expect([alice.bottomSeat(), alice.topSeat(), carol.bottomSeat(), carol.topSeat()]).toEqual([TWO, ONE, ONE, TWO]);
    });

    test('should count the seats taken live, not the seat asked again by its player, a seat left or freed, nor the history', () => {
        // Given
        const alice = page('alice');
        const bob = page('bob');

        // When: Alice moves to the other seat, Bob asks his seat twice
        alice.takeSeat(ONE);
        alice.takeSeat(TWO);
        bob.takeSeat(ONE);
        bob.takeSeat(ONE);

        // Then
        expect(bob.seatsTaken()).toEqual(3);

        // When
        alice.leaveSeat();
        bob.free(ONE);

        // Then
        expect(bob.seatsTaken()).toEqual(3);

        // When Carol joins late, replaying the chain
        const carol = page('carol');
        hub.replay(rooms.get('carol') as Room<Payloads>);

        // Then
        expect(carol.seats()).toEqual(['bob', null]);
        expect(carol.seatsTaken()).toEqual(0);
    });

    test('should free the seat a participant leaves, and refuse a seat out of the table or without a salt', () => {
        // Given
        const alice = page('alice');
        alice.takeSeat(ONE);

        // When
        alice.leaveSeat();
        rooms.get('alice')?.transmitMessage('seat', { seat: TWO, salt: 'short' });
        rooms.get('alice')?.transmitMessage('seat', { seat: 2 as TableSeat, salt: 'a'.repeat(32) });

        // Then
        expect(alice.seats()).toEqual([null, null]);
        expect(applied).toEqual([['alice', 'seat', true], ['alice', 'seat', true], ['alice', 'seat', true], ['alice', 'seat', false]]);
    });

    test('should keep the seats while they are closed', () => {
        // Given
        const alice = page('alice');
        const bob = page('bob');
        alice.takeSeat(ONE);
        open.set(false);

        // When
        alice.leaveSeat();
        bob.takeSeat(TWO);

        // Then
        expect(bob.seats()).toEqual(['alice', null]);
        expect([bob.canTake(TWO), alice.canLeave()]).toEqual([false, false]);
    });

    test('should let a participant without a seat take a free one, and a seated player leave its seat', () => {
        // Given
        const alice = page('alice');
        const bob = page('bob');

        // When
        alice.takeSeat(ONE);

        // Then: Bob sees the table from the free seat
        expect([alice.canTake(TWO), bob.canTake(ONE), bob.canTake(TWO)]).toEqual([false, false, true]);
        expect([alice.canLeave(), bob.canLeave()]).toEqual([true, false]);
        expect([bob.bottomSeat(), bob.topSeat()]).toEqual([TWO, ONE]);

        // When the seats close, then Alice leaves hers as they open again
        open.set(false);
        const closed = bob.bottomSeat();
        open.set(true);
        alice.leaveSeat();

        // Then
        expect([closed, bob.bottomSeat()]).toEqual([ONE, ONE]);
    });

    test('should let a seated player free the seat of the other one, away, while the seats are open', () => {
        // Given
        const alice = page('alice');
        const bob = page('bob');
        const carol = page('carol');
        alice.takeSeat(ONE);
        bob.takeSeat(TWO);

        // When
        hub.leave(rooms.get('bob') as Room<Payloads>);

        // Then
        expect(alice.awayPlayers()).toEqual(['bob']);
        expect([alice.canRelease(TWO), alice.canRelease(ONE), carol.canRelease(TWO)]).toEqual([true, false, false]);
        sending.set(true);
        expect(alice.canRelease(TWO)).toBe(false);

        // When
        carol.unseat(TWO);
        alice.unseat(TWO);

        // Then
        expect(carol.seats()).toEqual(['alice', null]);
        expect(applied.filter(([name, type]) => name === 'carol' && type === 'unseat').map(([, , freed]) => freed)).toEqual([false, true]);
    });

    test('should let the host, a spectator, free the seat of a lone player away while the seats are open', () => {
        // Given: Carol hosts the room
        hub.sequencer.set('carol');
        const bob = page('bob');
        const carol = page('carol');
        const dave = page('dave');
        bob.takeSeat(TWO);

        // When
        hub.leave(rooms.get('bob') as Room<Payloads>);

        // Then
        expect([carol.canRelease(TWO), carol.canRelease(ONE), dave.canRelease(TWO)]).toEqual([true, false, false]);
        sending.set(true);
        expect(carol.canRelease(TWO)).toBe(false);

        // When
        dave.unseat(TWO);
        carol.unseat(TWO);

        // Then
        expect(dave.seats()).toEqual([null, null]);
        expect(applied.filter(([name, type]) => name === 'dave' && type === 'unseat').map(([, , freed]) => freed)).toEqual([false, true]);
    });

    test('should apply a decision of the host alike on a page replaying the chain after a handover', () => {
        // Given: Carol, the host, frees the seat of Bob
        hub.sequencer.set('carol');
        const bob = page('bob');
        const carol = page('carol');
        bob.takeSeat(TWO);
        hub.leave(rooms.get('bob') as Room<Payloads>);
        carol.unseat(TWO);

        // When Alice orders the chain since, and Dave joins late
        hub.sequencer.set('alice');
        const dave = page('dave');
        hub.replay(rooms.get('dave') as Room<Payloads>);

        // Then
        expect(dave.seats()).toEqual([null, null]);
        expect(applied.filter(([name]) => name === 'dave')).toEqual([['dave', 'seat', true], ['dave', 'unseat', true]]);

        // When Carol, no longer the host, frees the seat of Dave away
        dave.takeSeat(ONE);
        hub.leave(rooms.get('dave') as Room<Payloads>);
        carol.unseat(ONE);

        // Then
        expect(carol.canRelease(ONE)).toBe(false);
        expect(carol.seats()).toEqual(['dave', null]);
    });

    test('should refuse a seat out of the table freed by the host', () => {
        // Given
        hub.sequencer.set('carol');
        const carol = page('carol');

        // When
        rooms.get('carol')?.transmitMessage('unseat', { seat: 5 as TableSeat, name: undefined as unknown as string });

        // Then
        expect(carol.seats()).toEqual([null, null]);
        expect(applied).toEqual([['carol', 'unseat', false]]);
    });

    test('should free no seat its player left meanwhile, nor while the seats are closed', () => {
        // Given
        const alice = page('alice');
        const bob = page('bob');
        alice.takeSeat(ONE);
        bob.takeSeat(TWO);

        // When
        rooms.get('alice')?.transmitMessage('unseat', { seat: TWO, name: 'dave' });
        open.set(false);
        alice.unseat(TWO);

        // Then
        expect(alice.seats()).toEqual(['alice', 'bob']);
    });

    test('should free the seat of a player late', () => {
        // Given
        const alice = page('alice');
        alice.takeSeat(ONE);

        // When
        alice.free(ONE);

        // Then
        expect(alice.seats()).toEqual([null, null]);
    });
});
