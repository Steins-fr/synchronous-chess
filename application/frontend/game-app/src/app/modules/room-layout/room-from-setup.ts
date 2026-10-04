import { DestroyRef, inject, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BlockRoom, NonEmptyBlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService, { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { notifyCheatFlags } from './cheat-notifications';

/**
 * The room of a page, built from the room setup form and cleared with the page, its cheats notified:
 * to call in an injection context, the page providing RoomSetupService, RoomManagerService and RoomSocketApi
 * @param maxPlayer the most players the room accepts
 * @param routing the block chain of each message type of the room
 */
export function roomFromSetup<M extends object>(maxPlayer: number, routing: NonEmptyBlockChainRouting<M>): Signal<BlockRoom<M> | undefined> {
    const roomSetupService: RoomSetupService = inject(RoomSetupService);
    const roomManagerService: RoomManagerService = inject(RoomManagerService);
    const room = signal<BlockRoom<M> | undefined>(undefined);
    let destroyed: boolean = false;

    const buildRoom = async (setup: RoomSetupInterface): Promise<void> => {
        try {
            const built: BlockRoom<M> = await roomManagerService.buildBlockRoom<M>(setup, maxPlayer, routing);
            if (destroyed) {
                // The page left while the room was built: nothing else would clear its socket, peers and timers
                built.clear();
                return;
            }
            room.set(built);
            roomSetupService.roomIsSetup(true);
        } catch {
            // Already notified: the form is available again, to try another room or name
            roomSetupService.roomIsSetup(false);
        }
    };

    roomSetupService.setup$.pipe(takeUntilDestroyed()).subscribe((setup: RoomSetupInterface) => void buildRoom(setup));
    inject(DestroyRef).onDestroy(() => {
        destroyed = true;
        room()?.clear();
    });
    notifyCheatFlags(() => room()?.cheatFlags());

    return room.asReadonly();
}
