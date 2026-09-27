import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { isNetworkMessage, NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { PlayerMessage, PlayerMessageType } from '@app/services/room-manager/classes/webrtc/messages/player-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import WebrtcStates from '@app/services/room-manager/classes/webrtc/webrtc-states';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { Player } from './player';

export class WebRtcPlayer extends Player {

    private static readonly PING_MARK: string = 'pingMark';
    private static readonly PONG_MARK: string = 'pongMark';

    private readonly subs: Subscription[] = [];

    private readonly messageSubject = new Subject<ReceivedMessage>();
    public readonly message$ = this.messageSubject.asObservable();
    private readonly disconnectedSubject = new Subject<void>();
    public readonly disconnected$ = this.disconnectedSubject.asObservable();

    public readonly states: Observable<WebrtcStates>; // For external debugging
    private connectionState: RTCIceConnectionState = 'connected';

    private readonly pingTimerId: ReturnType<typeof setInterval>;
    public ping: BehaviorSubject<string> = new BehaviorSubject<string>('');

    public constructor(name: string, private readonly webRTC: Webrtc) {
        super(name);

        this.states = this.webRTC.states;
        this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));
        this.subs.push(this.webRTC.data.subscribe((data: Message) => this.onPeerData(data)));

        this.pingTimerId = this.pingInterval();
    }

    public override clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.webRTC.close();
        clearInterval(this.pingTimerId);
        this.messageSubject.complete();
        this.disconnectedSubject.complete();
    }

    public override sendData(message: NetworkMessage): void {
        const id: number = this.webRTC.sendMessage(message);

        if (message.origin !== MessageOriginType.PLAYER) {
            TimedLogger.log(
                (new Date()).getTime().toString().substr(-5),
                id,
                `TO ${ this.name }`,
                message.type,
                message.payload,
            );
        }
    }

    public override get isLocal(): boolean {
        return false;
    }

    private pingInterval(): ReturnType<typeof setInterval> {
        const pingInterval: number = 2500;
        return setInterval(() => {
            const markId: string = this.markIdGenerator.next().value;
            window.performance.mark(`${ WebRtcPlayer.PING_MARK }-${ markId }`);

            const pingMessage: PlayerMessage = {
                type: PlayerMessageType.PING,
                origin: MessageOriginType.PLAYER,
                payload: markId
            };

            this.sendData(pingMessage);
        }, pingInterval);
    }

    private onPeerStates(states: WebrtcStates): void {
        if (this.connectionState === states.iceConnection) {
            return; // Do nothing, it's the same state
        }
        this.connectionState = states.iceConnection;

        if (this.connectionState === 'disconnected') {
            this.disconnectedSubject.next();
        }
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
        const pingMark: string = `${ WebRtcPlayer.PING_MARK }-${ playerMessage.payload }`;
        const pongMark: string = `${ WebRtcPlayer.PONG_MARK }-${ playerMessage.payload }`;
        const measureName: string = `${ pingMark }_${ pongMark }`;
        window.performance.mark(pongMark);
        window.performance.measure(measureName, pingMark, pongMark);
        const performances: PerformanceEntry[] = window.performance.getEntriesByName(measureName, 'measure');
        const performance: PerformanceEntry | undefined = performances.shift();

        if (performance) {
            this.ping.next((performance.duration / 2.0).toFixed(1));
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
            default:
                switchExhaustivenessGuard(playerMessage);
        }
    }

    private onPeerData(data: Message): void {
        if (!isNetworkMessage(data)) {
            console.warn(`Invalid message from ${ this.name }`, data);
            return;
        }

        if (data.origin === MessageOriginType.PLAYER) {
            this.onPlayerMessage(data);
            return;
        }

        const message: ReceivedMessage = { ...data, from: this.name };

        TimedLogger.log(
            (new Date()).getTime().toString().substr(-5),
            `FROM ${ message.from }`,
            message.type,
            message.payload,
        );

        this.messageSubject.next(message);
    }
}
