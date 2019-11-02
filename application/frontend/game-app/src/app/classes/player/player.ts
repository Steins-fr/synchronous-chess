import { Subject, Observable, Subscription, BehaviorSubject } from 'rxjs';

import { Webrtc, WebrtcConnectionState } from '../webrtc/webrtc';
import WebrtcStates from '../webrtc/webrtc-states';
import { Message } from '../webrtc/messages/message';
import { PlayerMessage, PlayerMessageType } from '../webrtc/messages/player-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';

export enum PlayerEventType {
    DISCONNECTED = 'disconnected',
    MESSAGE = 'message'
}

export interface PlayerEvent<T extends Message> {
    type: PlayerEventType;
    name: string; // Player name
    message: T;
}

export class Player {

    private static readonly PING_MARK: string = 'pingMark';
    private static readonly PONG_MARK: string = 'pongMark';

    private readonly subs: Array<Subscription> = [];
    private readonly _event: Subject<PlayerEvent<Message>> = new Subject<PlayerEvent<Message>>();
    public readonly event: Observable<PlayerEvent<Message>> = this._event.asObservable();
    public states?: Observable<WebrtcStates>; // For external debugging
    private connectionState: WebrtcConnectionState = WebrtcConnectionState.CONNECTED;

    private pingTimerId?: NodeJS.Timer;
    public ping: BehaviorSubject<string> = new BehaviorSubject<string>('');

    private readonly markIdGenerator: Generator = function* generator(name: string): Generator {
        let id: number = 0;
        while (true) {
            yield `${name}-${++id}`;
        }
    }(this.name);

    public constructor(public readonly name: string, private readonly webRTC?: Webrtc) {
        if (this.isLocal() === false) {
            this.states = webRTC.states;
            this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));
            this.subs.push(this.webRTC.data.subscribe((data: Message) => this.onPeerData(data)));

            this.pingInterval();
        }
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        if (this.webRTC) {
            this.webRTC.close();
        }
        if (this.pingTimerId === undefined) {
            clearInterval(this.pingTimerId);
        }
    }

    private pingInterval(): void {
        this.pingTimerId = setInterval(() => {
            const markId: string = this.markIdGenerator.next().value;
            window.performance.mark(`${Player.PING_MARK}-${markId}`);

            const pingMessage: PlayerMessage = {
                type: PlayerMessageType.PING,
                origin: MessageOriginType.PLAYER,
                payload: markId
            };

            this.sendData(pingMessage);
        }, 2500);
    }

    private pushEvent(type: PlayerEventType, message?: Message): void {
        this._event.next({
            type,
            message,
            name: this.name
        });
    }

    private onPeerStates(states: WebrtcStates): void {
        if (this.connectionState === states.iceConnection) {
            return; // Do nothing, it's the same state
        }
        this.connectionState = states.iceConnection as WebrtcConnectionState;

        if (this.connectionState === WebrtcConnectionState.DISCONNECTED) {
            this.pushEvent(PlayerEventType.DISCONNECTED);
        }
    }

    public sendData(message: Message): void {
        if (this.webRTC) {
            this.webRTC.sendMessage(message);
        }
    }

    public isLocal(): boolean {
        return this.webRTC === undefined;
    }

    private onPlayerPingMessage(playerMessage: PlayerMessage): void {
        const message: PlayerMessage = {
            type: PlayerMessageType.PONG,
            origin: MessageOriginType.PLAYER,
            payload: playerMessage.payload
        };
        this.sendData(message);
    }

    private onPlayerPongMessage(playerMessage: PlayerMessage): void {
        const pingMark: string = `${Player.PING_MARK}-${playerMessage.payload}`;
        const pongMark: string = `${Player.PONG_MARK}-${playerMessage.payload}`;
        const measureName: string = `${pingMark}_${pongMark}`;
        window.performance.mark(pongMark);
        window.performance.measure(measureName, pingMark, pongMark);
        const performances: Array<PerformanceEntry> = window.performance.getEntriesByName(measureName, 'measure');
        if (performances.length > 0) {
            const performance: PerformanceEntry = performances.shift();
            this.ping.next(performance.duration.toFixed(1));
        }
        window.performance.clearMarks(pingMark);
        window.performance.clearMarks(pongMark);
        window.performance.clearMeasures(measureName);
    }

    private onPlayerMessage(playerMessage: PlayerMessage): void {
        switch (playerMessage.type) {
            case PlayerMessageType.PING:
                this.onPlayerPingMessage(playerMessage);
                break;
            case PlayerMessageType.PONG:
                this.onPlayerPongMessage(playerMessage);
                break;
        }
    }

    private onPeerData(message: Message): void {
        const playerMessage: PlayerMessage = message as PlayerMessage;
        if (playerMessage.origin && playerMessage.origin === MessageOriginType.PLAYER) {
            this.onPlayerMessage(playerMessage);
            return;
        }
        this.pushEvent(PlayerEventType.MESSAGE, message);
    }
}
