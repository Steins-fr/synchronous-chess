import { Participant } from './participant';
import { Block } from './block';
import { WaitingBlock } from './waiting-block';

export class WaitingQueue {

    private static readonly RATIO: number = 2.0 / 3.0;
    private readonly _queue: Map<string, WaitingBlock> = new Map<string, WaitingBlock>();
    private _participantNumber: number = 1;
    private _localParticipant?: Participant;

    public set participantNumber(nb: number) {
        this._participantNumber = nb;
    }

    public set localParticipant(localParticipant: Participant) {
        this._localParticipant = localParticipant;
    }

    public get localParticipant(): Participant {
        if (!this._localParticipant) {
            throw new Error('Local participant not set, please call isReady() first');
        }

        return this._localParticipant;
    }

    public approveBlock(block: Block, participant: Participant): boolean {
        let wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            wb = new WaitingBlock(block);
        }

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
        let wb: WaitingBlock | undefined = this._queue.get(block.hash);

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
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        return this.hasApproved(wb, participant);
    }

    private hasApproved(wb: WaitingBlock, participant: Participant): boolean {
        return !!wb.approvedBy.find((p: Participant) => p.name === participant.name);
    }

    public hasDeclinedBlock(block: Block, participant: Participant): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        return this.hasDeclined(wb, participant);
    }

    private hasDeclined(wb: WaitingBlock, participant: Participant): boolean {
        return !!wb.declinedBy.find((p: Participant) => p.name === participant.name);
    }

    public hasBlock(block: Block): boolean {
        return this._queue.has(block.hash);
    }

    public blockIsDeclined(block: Block): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        return wb.declinedBy.length > this._participantNumber * WaitingQueue.RATIO;
    }

    public blockJustApproved(block: Block): boolean {
        const wb: WaitingBlock | undefined = this._queue.get(block.hash);

        if (!wb) {
            return false;
        }

        if (this.blockIsDeclined(wb.block) || wb.isApproved) {
            return false;
        }

        wb.isApproved = wb.approvedBy.length > this._participantNumber * WaitingQueue.RATIO;

        return wb.isApproved;
    }

    public blockIsApproved(block: Block): boolean {
        return this._queue.get(block.hash)?.isApproved ?? false;
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
