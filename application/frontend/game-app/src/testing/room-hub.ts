import { signal } from '@angular/core';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Player } from '@app/services/room-manager/classes/player/player';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { TestHelper } from '@testing/test.helper';
import { filter, Subject } from 'rxjs';

/**
 * The rooms of the participants of a chain: every message transmitted reaches every room, in one order, as the
 * sequencer orders them
 */
export class RoomHub<M extends object> {
    public readonly delivered: AppMessage[] = [];
    /** The cheats each participant reported */
    public readonly reports: Array<[string, AppMessage, CheatReason]> = [];
    private readonly rooms = new Map<Room<M>, Subject<AppMessage>>();
    private readonly players = signal<ReadonlyArray<Readonly<Player>>>([]);
    private readonly queue: AppMessage[] = [];
    private delivering: boolean = false;
    /** The participants whose messages wait, as a page waiting for the chain before its message comes after it */
    private readonly holding = new Set<string>();
    public readonly held: AppMessage[] = [];

    /**
     * @param tamper changes a message of a participant before the chain orders it, as a cheating client would
     */
    public room(name: string, tamper: (message: AppMessage) => AppMessage = (message: AppMessage) => message): Room<M> {
        const messages = new Subject<AppMessage>();
        const room: Room<M> = TestHelper.cast<Room<M>>({
            localPlayer: { name },
            roomName: 'room',
            players: this.players,
            messenger: (type: string) => messages.pipe(filter((message: AppMessage) => message.type === type)),
            transmitMessage: (type: string, payload: unknown) => this.transmit(tamper({ from: name, type, payload })),
            reportCheat: (message: AppMessage, reason: CheatReason) => this.reports.push([name, message, reason]),
        });
        this.rooms.set(room, messages);
        this.players.update((players) => players.some((player) => player.name === name) ? players : [...players, TestHelper.cast<Player>({ name })]);
        return room;
    }

    /** The room stops receiving the messages, as a page closed */
    public close(room: Room<M>): void {
        this.rooms.delete(room);
    }

    /** The messages of the participant wait until released */
    public hold(name: string): void {
        this.holding.add(name);
    }

    public release(): void {
        this.holding.clear();
        this.held.splice(0).forEach((message: AppMessage) => this.send(message));
    }

    private transmit(message: AppMessage): void {
        if (this.holding.has(message.from)) {
            this.held.push(message);
        } else {
            this.send(message);
        }
    }

    public send(message: AppMessage): void {
        this.queue.push(message);

        if (this.delivering) {
            return;
        }

        this.delivering = true;
        for (let next = this.queue.shift(); next; next = this.queue.shift()) {
            this.delivered.push(next);
            this.rooms.forEach((messages: Subject<AppMessage>) => messages.next(next));
        }
        this.delivering = false;
    }

    /** Delivers again messages of the chain to a room only, as when a player reloads the page */
    public replay(room: Room<M>, messages: ReadonlyArray<AppMessage> = [...this.delivered]): void {
        messages.forEach((message: AppMessage) => this.rooms.get(room)?.next(message));
    }

    public types(): string[] {
        return this.delivered.map((message: AppMessage) => message.type);
    }

    /** The cheats reported, as `reporter reason author` */
    public reported(): string[] {
        return this.reports.map(([reporter, message, reason]) => `${ reporter } ${ reason } ${ message.from }`);
    }
}
