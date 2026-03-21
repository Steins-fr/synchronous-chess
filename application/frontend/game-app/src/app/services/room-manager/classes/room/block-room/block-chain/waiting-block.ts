import { Block } from './block';
import { Participant } from './participant';

export class WaitingBlock {
    public approvedBy: Participant[] = [];
    public declinedBy: Participant[] = [];
    public isApproved: boolean = false;
    public isDeclined: boolean = false;

    public constructor(public block: Block) {}
}
