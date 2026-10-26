import { DestroyRef, inject, Provider, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockRoom, NonEmptyBlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import { RoomSessionStore } from '@app/services/room-session/room-session.store';
import RoomSetupService, { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { notifyCheatFlags } from './cheat-notifications';
import { MatchLeaveWarning } from './match-leave-warning';
import { showRoomInUrl } from './room-url';

/** The services of the room of a page, for roomFromSetup(): provided by the page, cleared with it */
export function provideRooms(): Provider[] {
    return [RoomSetupService, RoomManagerService, RoomSocketApi, MatchLeaveWarning];
}

/**
 * The room of a page, built from the room setup form and cleared with the page, its cheats notified:
 * to call in an injection context, the page providing provideRooms(). The room built, the page shows its id in its URL
 * and keeps its session in the tab, for a reload to resume it, and holds its lock among the tabs; the room given up, it
 * removes them
 * @param maxPlayer the most players the room accepts
 * @param routing the block chain of each message type of the room
 */
export function roomFromSetup<M extends object>(maxPlayer: number, routing: NonEmptyBlockChainRouting<M>): Signal<BlockRoom<M> | undefined> {
    const roomSetupService: RoomSetupService = inject(RoomSetupService);
    const roomManagerService: RoomManagerService = inject(RoomManagerService);
    const roomSessions: RoomSessionStore = inject(RoomSessionStore);
    const router: Router = inject(Router);
    const room = signal<BlockRoom<M> | undefined>(undefined);
    // Aborted once the page left: stops the join asked again for a while
    const destroyed: AbortController = new AbortController();
    // The room being built: left meanwhile, the player gave it up too
    let building: string | undefined;

    // The room given up: a reload shows the list, or the join dialog of a room still in the URL
    const giveUp = (roomId: string | undefined): void => {
        if (roomId !== undefined) {
            roomSessions.remove(roomId);
        }
        roomSetupService.releaseLock();
    };

    const buildRoom = async (setup: RoomSetupInterface): Promise<void> => {
        building = setup.roomName;
        try {
            const built: BlockRoom<M> = await roomManagerService.buildBlockRoom<M>(setup, maxPlayer, routing, destroyed.signal);
            if (destroyed.signal.aborted) {
                // The page left while the room was built: nothing else would clear its socket, peers and timers
                built.clear();
                return;
            }
            room.set(built);
            roomSetupService.roomIsSetup(true);
            // Under its id, the one the API drew for a room created
            roomSessions.save(built.roomName, { playerName: setup.playerName, token: setup.token });
            showRoomInUrl(router, built.roomName);
            void roomSetupService.holdLock(built.roomName, setup.playerName);
            // Already notified: the form is available again, to try again or join another room
            built.roomConnection.joinFailed$.subscribe(() => {
                built.clear();
                room.set(undefined);
                roomSetupService.roomIsSetup(false);
                giveUp(built.roomName);
                showRoomInUrl(router, null);
            });
        } catch {
            if (destroyed.signal.aborted) {
                return;
            }
            // Already notified: the form is available again, to try another room or name
            roomSetupService.roomIsSetup(false);
            giveUp(setup.roomName);
            showRoomInUrl(router, null);
        } finally {
            building = undefined;
        }
    };

    roomSetupService.setup$.pipe(takeUntilDestroyed()).subscribe((setup: RoomSetupInterface) => void buildRoom(setup));
    inject(DestroyRef).onDestroy(() => {
        destroyed.abort();
        // Left through the app: the player left its room, or the one it was joining
        const left: BlockRoom<M> | undefined = room();
        left?.clear();
        giveUp(left?.roomName ?? building);
    });
    notifyCheatFlags(() => room()?.cheatFlags());

    return room.asReadonly();
}
