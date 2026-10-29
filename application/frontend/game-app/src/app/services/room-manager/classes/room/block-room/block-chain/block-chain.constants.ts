export const keyPairAlgorithm: EcKeyImportParams = {
    name: 'ECDSA',
    namedCurve: 'P-384'
};

export const signatureAlgorithm: RsaHashedImportParams = {
    name: 'ECDSA',
    hash: {
        name: 'SHA-384'
    }
};

// The genesis block never changes, its hash is known in advance so that a chain is usable as soon as it is created.
// It is shared by all the chains and never verified: the chain name is hashed from the first block on.
export const genesisHash: string = '3cb3b51209662bbe46acb604c9c66105a5eba28898c8f60ee7a7a37fc2644b6c';

/**
 * The time of the first block of a chain is before 2100, and the time of a block at most a day after the previous one,
 * in milliseconds: so far, adding seconds would not change a time, and the next sequencers would give it to all their
 * blocks. An honest chain never meets them, its room ending once its players left
 */
export const firstTimeLimit: number = Date.UTC(2100, 0, 1);
export const maxTimeGap: number = 24 * 60 * 60 * 1000;
