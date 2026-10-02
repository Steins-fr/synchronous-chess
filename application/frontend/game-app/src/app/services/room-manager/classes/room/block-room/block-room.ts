import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { takeUntil } from 'rxjs';
import { Block } from './block-chain/block';
import { DistributedBlockChain } from './block-chain/distributed-block-chain';
import { ParticipantKeys, ParticipantReady, ParticipantRegistry } from './block-chain/participant-registry';
import { BlockChainName } from './block-chain-name.enum';
import { BlockRoomInterface } from './block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { Player } from '../../player/player';
import { RoomNetwork } from '../../room-network/room-network';

/**
 * Names the block chain of each message type.
 * Each chain agrees on its blocks independently, so a busy chain never delays the messages of another one.
 */
export type BlockChainRouting<M extends object> = { readonly [K in keyof M & string]: BlockChainName };

/** A routing with at least one message type, an empty one is rejected at compile time */
export type NonEmptyBlockChainRouting<M extends object> = [keyof M & string] extends [never] ? never : BlockChainRouting<M>;

/** Merges the routings of several features, a message type routed twice is a mistake */
export function mergeBlockChainRoutings<A extends object, B extends object>(a: BlockChainRouting<A>, b: BlockChainRouting<B>): BlockChainRouting<A & B> {
    const duplicates: ReadonlyArray<string> = Object.keys(a).filter((type: string) => Object.hasOwn(b, type));

    if (duplicates.length > 0) {
        throw new Error(`Message types routed twice: ${ duplicates.join(', ') }`);
    }

    return { ...a, ...b };
}

export class BlockRoom<M extends object> extends Room<M> implements BlockRoomInterface {

    private readonly participants: ParticipantRegistry;
    /** The block chain of each message type, to transmit the messages */
    private readonly blockChainOf: ReadonlyMap<string, DistributedBlockChain>;
    /** The block chains by name, to dispatch the received messages */
    private readonly blockChains: ReadonlyMap<BlockChainName, DistributedBlockChain>;

    public static async createKeys(): Promise<ParticipantKeys> {
        return await ParticipantRegistry.createKeys();
    }

    public constructor(
        roomApi: RoomSocketApi,
        roomConnection: RoomNetwork,
        keys: ParticipantKeys,
        routing: NonEmptyBlockChainRouting<M>,
    ) {
        super(roomApi, roomConnection);
        this.participants = new ParticipantRegistry(this.localPlayer, keys);

        const routes: BlockChainRouting<M> = routing;
        const routeMap: ReadonlyMap<string, BlockChainName> = new Map(Object.entries<BlockChainName>(routes));
        const blockChainByName = new Map<BlockChainName, DistributedBlockChain>();
        const blockChainOf = new Map<string, DistributedBlockChain>();
        for (const [type, name] of routeMap) {
            const blockChain: DistributedBlockChain = blockChainByName.get(name) ?? new DistributedBlockChain(name, routeMap, this, this.participants);
            blockChainByName.set(name, blockChain);
            blockChainOf.set(type, blockChain);
        }
        this.blockChainOf = blockChainOf;
        this.blockChains = blockChainByName;

        this.participants.ready$.pipe(takeUntil(this.destroyRef)).subscribe((ready: ParticipantReady) => {
            this.blockChains.forEach((blockChain: DistributedBlockChain) => blockChain.onParticipantReady(ready));
        });
        this.participants.left$.pipe(takeUntil(this.destroyRef)).subscribe((name: string) => {
            this.blockChains.forEach((blockChain: DistributedBlockChain) => blockChain.onParticipantLeft(name));
        });
    }

    public override clear(): void {
        super.clear();
        this.participants.clear();
        this.blockChains.forEach((blockChain: DistributedBlockChain) => blockChain.clear());
    }

    public override transmitMessage<K extends keyof M & string>(type: K, payload: M[K]): void {
        const blockChain: DistributedBlockChain | undefined = this.blockChainOf.get(type);

        if (!blockChain) {
            throw new Error(`No block chain routes the ${ type } messages`);
        }

        // Do not await, there is no need to handle the result
        void blockChain.transmitMessage(type, payload);
    }

    protected override onMessage(message: ReceivedMessage): void {
        if (message.origin === MessageOriginType.BLOCK_ROOM_PARTICIPANT) {
            this.participants.handle(message);
        } else if (message.origin === MessageOriginType.BLOCK_ROOM_SERVICE) {
            const blockChain: DistributedBlockChain | undefined = this.blockChains.get(message.chain);

            if (blockChain) {
                blockChain.handle(message);
            } else {
                TimedLogger.error(`No ${ message.chain } block chain in this room, message from ${ message.from }`);
            }
        }
    }

    public notifyMessage(block: Block): void {
        TimedLogger.log(block.data);

        this.publicMessenger$.next(block.data);
    }

    protected override handleRoomPlayerAdd(player: Player): void {
        super.handleRoomPlayerAdd(player);

        this.participants.onNewPlayer(player);
    }

    protected override handleRoomPlayerRemove(player: Player): void {
        super.handleRoomPlayerRemove(player);

        // A player who left no longer votes, keeping it would make the approval threshold unreachable
        this.participants.onPlayerLeft(player);
    }
}
