export interface PlayerData {
    from: string;
    type: string;
    payload: unknown;
}

export class Block {
    public constructor(
        public readonly index: number,
        public readonly timestamp: string,
        public readonly data: PlayerData,
        public readonly previousHash: string,
        public readonly hash: string,
        public readonly signature: string) {
    }
}
