import { Participant } from './participant';
import { Block } from './block';
import { WaitingBlock } from './waiting-block';

/** The participants of the room, shared by all the chains */
export interface ReadyParticipants {
    readonly local: Participant;
    /** Number of participants whose public key is known, they are the ones voting for the blocks */
    readonly readyCount: number;
    isVoter(name: string): boolean;
}

export class WaitingQueue {

    private static readonly RATIO: number = 2.0 / 3.0;
    private readonly _queue: Map<string, WaitingBlock> = new Map<string, WaitingBlock>();

    public constructor(private readonly participants: ReadyParticipants) {}

    private get localParticipant(): Participant {
        return this.participants.local;
    }

    public approveBlock(block: Block, participant: Participant): boolean {
        const wb: WaitingBlock = this._queue.get(block.hash) ?? new WaitingBlock(block);

        for (const waitingBlock of this._queue.values()) {
            if (waitingBlock.block.index === wb.block.index
                && waitingBlock.block.hash !== wb.block.hash) {
                if (waitingBlock.block.hash < wb.block.hash && !this.hasDeclined(wb, this.localParticipant)) {
                    wb.declinedBy.push(this.localParticipant);
                    break;
                } else if (!this.hasDeclined(waitingBlock, this.localParticipant)) {
                    waitingBlock.declinedBy.push(this.localParticipant);
                    this._queue.set(waitingBlock.block.hash, waitingBlock);
                }
            }
        }

        if (!this.hasApproved(wb, participant) && !this.hasDeclined(wb, participant)) {
            wb.approvedBy.push(participant);
        }

        this._queue.set(block.hash, wb);

        return this.hasApproved(wb, participant);
    }

    public declineBlock(block: Block, participant: Participant): void {
        const wb: WaitingBlock = this._queue.get(block.hash) ?? new WaitingBlock(block);

        if (!this.hasDeclined(wb, participant)) {
            wb.declinedBy.push(participant);
            wb.isDeclined = true;
        }

        this._queue.set(block.hash, wb);
    }

    public hasApprovedBlock(block: Block, participant: Participant): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        return this.hasApproved(wb, participant);
    }

    private hasApproved(wb: WaitingBlock, participant: Participant): boolean {
        return wb.approvedBy.some((p: Participant) => p.name === participant.name);
    }

    public hasDeclinedBlock(block: Block, participant: Participant): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        return this.hasDeclined(wb, participant);
    }

    private hasDeclined(wb: WaitingBlock, participant: Participant): boolean {
        return wb.declinedBy.some((p: Participant) => p.name === participant.name);
    }

    public hasBlock(block: Block): boolean {
        return this._queue.has(block.hash);
    }

    public blockIsDeclined(block: Block): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        return this.countVotes(wb.declinedBy) > this.participants.readyCount * WaitingQueue.RATIO;
    }

    public blockJustApproved(block: Block): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        if (this.blockIsDeclined(wb.block) || wb.isApproved) {
            return false;
        }

        wb.isApproved = this.countVotes(wb.approvedBy) > this.participants.readyCount * WaitingQueue.RATIO;

        return wb.isApproved;
    }

    /**
     * Only the votes of the current voters are counted, as only they make the threshold:
     * the votes of the participants who left, or whose key is not known yet, could approve a block the other peers do not.
     */
    private countVotes(participants: ReadonlyArray<Participant>): number {
        return participants.filter((participant: Participant) => this.participants.isVoter(participant.name)).length;
    }

    public blockIsApproved(block: Block): boolean {
        return this._queue.get(block.hash)?.isApproved ?? false;
    }

    /** The blocks still waiting for their approval, from the oldest */
    public pendingBlocks(): ReadonlyArray<Block> {
        return [...this._queue.values()]
            .filter((wb: WaitingBlock) => !wb.isApproved)
            .map((wb: WaitingBlock) => wb.block)
            .sort((a: Block, b: Block) => a.index - b.index);
    }

    public clearBlock(block: Block): void {
        this._queue.delete(block.hash);
    }

    public clearOldBlock(index: number): void {
        const maxIndex: number = index - 10;
        for (const wb of this._queue.values()) {
            if (wb.block.index < maxIndex) {
                this._queue.delete(wb.block.hash);
            }
        }
    }

    public clear(): void {
        this._queue.clear();
    }
}
