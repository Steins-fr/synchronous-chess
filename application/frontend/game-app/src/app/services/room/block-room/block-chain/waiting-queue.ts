import { Participant } from './participant';
import { Block } from './block';
import { WaitingBlock } from './waiting-block';

export class WaitingQueue {

    private static readonly RATIO: number = 2.0 / 3.0;
    private readonly _queue: Map<string, WaitingBlock> = new Map<string, WaitingBlock>();
    private _participantNumber: number = 1;
    private _localParticipant: Participant;

    public set participantNumber(nb: number) {
        this._participantNumber = nb;
    }

    public set localParticipant(localParticipant: Participant) {
        this._localParticipant = localParticipant;
    }

    public approveBlock(block: Block, participant: Participant): boolean {
        let wb: WaitingBlock = this._queue.get(block.hash);

        if (!wb) {
            wb = new WaitingBlock(block);
        }

        for (const [_, waitingBlock] of this._queue) {
            if (waitingBlock.block.index === wb.block.index
                && waitingBlock.block.hash !== wb.block.hash) {
                if (waitingBlock.block.hash < wb.block.hash && !this.hasDeclined(wb, this._localParticipant)) {
                    wb.declinedBy.push(this._localParticipant);
                    break;
                } else if (!this.hasDeclined(waitingBlock, this._localParticipant)) {
                    waitingBlock.declinedBy.push(this._localParticipant);
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
        let wb: WaitingBlock = this._queue.get(block.hash);

        if (!wb) {
            wb = new WaitingBlock(block);
        }

        if (!this.hasDeclined(wb, participant)) {
            wb.declinedBy.push(participant);
            wb.isDeclined = true;
        }

        this._queue.set(block.hash, wb);
    }

    public hasApprovedBlock(block: Block, participant: Participant): boolean {
        if (this._queue.has(block.hash)) {
            return this.hasApproved(this._queue.get(block.hash), participant);
        }

        return false;
    }

    private hasApproved(wb: WaitingBlock, participant: Participant): boolean {
        return !!wb.approvedBy.find((p: Participant) => p.name === participant.name);
    }

    public hasDeclinedBlock(block: Block, participant: Participant): boolean {
        if (this._queue.has(block.hash)) {
            return this.hasDeclined(this._queue.get(block.hash), participant);
        }

        return false;
    }

    private hasDeclined(wb: WaitingBlock, participant: Participant): boolean {
        return !!wb.declinedBy.find((p: Participant) => p.name === participant.name);
    }

    public hasBlock(block: Block): boolean {
        return this._queue.has(block.hash);
    }

    public blockIsDeclined(block: Block): boolean {
        if (this._queue.has(block.hash)) {
            return this._queue.get(block.hash).declinedBy.length > this._participantNumber * WaitingQueue.RATIO;
        }

        return false;
    }

    public blockJustApproved(block: Block): boolean {
        if (this._queue.has(block.hash)) {
            const wb: WaitingBlock = this._queue.get(block.hash);

            if (this.blockIsDeclined(wb.block) || wb.isApproved) {
                return false;
            }

            wb.isApproved = wb.approvedBy.length > this._participantNumber * WaitingQueue.RATIO;

            return wb.isApproved;
        }

        return false;
    }

    public blockIsApproved(block: Block): boolean {
        return this._queue.has(block.hash) ? this._queue.get(block.hash).isApproved : false;
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
