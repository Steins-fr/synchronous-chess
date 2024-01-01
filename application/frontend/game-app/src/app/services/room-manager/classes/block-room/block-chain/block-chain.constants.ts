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
