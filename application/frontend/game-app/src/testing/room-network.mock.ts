import { signal } from '@angular/core';
import { Negotiator } from '@app/services/room-manager/classes/negotiator/negotiator';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { Player } from '@app/services/room-manager/classes/player/player';
import { RoomNetwork } from '@app/services/room-manager/classes/room-network/room-network';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { TestHelper } from './test.helper';

/**
 * Controllable replacement of RoomNetwork: its events are pushed by the test
 */
export class RoomNetworkMock {
    public readonly localPlayer: LocalPlayer;
    public readonly negotiators = signal<ReadonlyMap<string, Readonly<Negotiator>>>(new Map());
    public readonly onMessage$ = new Subject<ReceivedMessage>();
    public readonly playerAdded$ = new Subject<Player>();
    public readonly playerRemoved$ = new Subject<Player>();
    public readonly queueAdded$ = new Subject<string>();
    public readonly queueRemoved$ = new Subject<string>();
    public readonly roomName: string = 'room';
    public readonly clear = vi.fn();

    public constructor(localPlayerName: string = 'local', public readonly initiator: boolean = true) {
        this.localPlayer = new LocalPlayer(localPlayerName);
    }

    public get roomNetwork(): RoomNetwork {
        return TestHelper.cast<RoomNetwork>(this);
    }
}
