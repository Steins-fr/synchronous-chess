import { ElGamalCipherText } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { CylinderCheat, CylinderState, CylinderStep } from './cylinder-state';


/**
 * Whether the chambers are the ones of the input, turned by some offset: a chamber of no count turned with them, which a
 * former spin made, is not the cheat of this one
 */
function isRotation(input: ReadonlyArray<number | undefined>, output: ReadonlyArray<number | undefined>): boolean {
    return input.some((_, offset: number) =>
        output.every((bullets: number | undefined, index: number) => bullets === input[(index + offset) % input.length]));
}

/**
 * Checks a cylinder once both players disclosed their shares of the key: each spin turned the cylinder it received,
 * without changing its chambers. The loads need no check, their proofs were: each one holds the bullets of its
 * player. The randomness of the spins is not disclosed: the counts of the chambers tell a spin made otherwise.
 * @param pause yields to the browser between two decryptions
 * @returns the spins made otherwise, reported against their player
 */
export async function verifyCylinder(state: CylinderState, pause: () => Promise<void>): Promise<ReadonlyArray<CylinderCheat>> {
    const secret: bigint = [...state.disclosures.values()].reduce((sum: bigint, { secret: value }) => sum + value, 0n) % state.cipher.group.order;
    const decrypt = async (chambers: ReadonlyArray<ElGamalCipherText>): Promise<ReadonlyArray<number | undefined>> => {
        const bullets: Array<number | undefined> = [];
        for (const chamber of chambers) {
            bullets.push(state.cipher.decryptWithKey(chamber, secret, 2));
            // eslint-disable-next-line no-await-in-loop -- one decryption at a time, for the page to stay fluid
            await pause();
        }
        return bullets;
    };

    const cheats: CylinderCheat[] = [];
    let input: ReadonlyArray<number | undefined> = await decrypt(state.loaded);
    for (const spin of state.spins as ReadonlyArray<CylinderStep>) {
        // eslint-disable-next-line no-await-in-loop -- the spins are checked one after the other
        const output: ReadonlyArray<number | undefined> = await decrypt(spin.chambers);
        if (!isRotation(input, output)) {
            cheats.push({ message: spin.message, reason: CheatReason.INVALID_SPIN });
        }
        input = output;
    }
    return cheats;
}
