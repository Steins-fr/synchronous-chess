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
    /** The participants each one excluded, as `[page, player]` */
    public readonly excluded: Array<[string, string]> = [];
    /** The messages of each room, the ones replayed to it, its history, and the departures it sees */
    private readonly rooms = new Map<Room<M>, { readonly messages: Subject<AppMessage>; readonly history: Set<AppMessage>; readonly departed: Subject<string> }>();
    private readonly players = signal<ReadonlyArray<Readonly<Player>>>([]);
    private readonly queue: AppMessage[] = [];
    private delivering: boolean = false;
    /** The participants whose messages wait, as a page waiting for the chain before its message comes after it */
    private readonly holding = new Set<string>();
    public readonly held: AppMessage[] = [];
    /** The participant ordering the next messages: none by default, a spec reading who ordered a message sets it */
    public readonly sequencer = signal<string | undefined>(undefined);
    /** The chain time stamped on the next messages, as the sequencer orders them */
    public time: number = 0;
    /** When each message delivered was ordered, and by whom once a sequencer is set: the same in every room, replayed too */
    private readonly stamps = new WeakMap<AppMessage, { readonly time: number; readonly sequencer: string | undefined }>();

    /**
     * @param tamper changes a message of a participant before the chain orders it, as a cheating client would
     */
    public room(name: string, tamper: (message: AppMessage) => AppMessage = (message: AppMessage) => message): Room<M> {
        const messages = new Subject<AppMessage>();
        const history = new Set<AppMessage>();
        const departed = new Subject<string>();
        const room: Room<M> = TestHelper.cast<Room<M>>({
            localPlayer: { name },
            roomName: 'room',
            players: this.players,
            queue: signal<ReadonlyArray<string>>([]).asReadonly(),
            departed$: departed.asObservable(),
            exclude: (player: string) => this.excluded.push([name, player]),
            messenger: (type: string) => messages.pipe(filter((message: AppMessage) => message.type === type)),
            transmitMessage: (type: string, payload: unknown) => this.transmit(tamper({ from: name, type, payload })),
            reportCheat: (message: AppMessage, reason: CheatReason) => this.reports.push([name, message, reason]),
            isHistory: (message: AppMessage) => history.has(message),
            sequencer: this.sequencer.asReadonly(),
            sequencedAt: (message: AppMessage) => this.stamps.get(message)?.time,
            sequencedBy: (message: AppMessage) => this.stamps.get(message)?.sequencer,
        });
        this.rooms.set(room, { messages, history, departed });
        this.players.update((players) => players.some((player) => player.name === name) ? players : [...players, TestHelper.cast<Player>({ name })]);
        return room;
    }

    /** The room stops receiving the messages, as a page closed */
    public close(room: Room<M>): void {
        this.rooms.delete(room);
    }

    /** The participant leaves the room: its page closed, the others no longer see it, and agree it left */
    public leave(room: Room<M>): void {
        this.close(room);
        this.players.update((players) => players.filter((player) => player.name !== room.localPlayer.name));
        this.rooms.forEach(({ departed }) => departed.next(room.localPlayer.name));
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
            this.stamps.set(next, { time: this.time, sequencer: this.sequencer() });
            this.delivered.push(next);
            this.rooms.forEach(({ messages }) => messages.next(next));
        }
        this.delivering = false;
    }

    /** Delivers again messages of the chain to a room only, as its history, as when a player reloads the page */
    public replay(room: Room<M>, messages: ReadonlyArray<AppMessage> = [...this.delivered]): void {
        const replayed = this.rooms.get(room);
        messages.forEach((message: AppMessage) => {
            replayed?.history.add(message);
            replayed?.messages.next(message);
        });
    }

    public types(): string[] {
        return this.delivered.map((message: AppMessage) => message.type);
    }

    /** The cheats reported, as `reporter reason author` */
    public reported(): string[] {
        return this.reports.map(([reporter, message, reason]) => `${ reporter } ${ reason } ${ message.from }`);
    }
}
