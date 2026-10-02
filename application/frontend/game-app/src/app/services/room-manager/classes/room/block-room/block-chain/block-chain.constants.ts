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
