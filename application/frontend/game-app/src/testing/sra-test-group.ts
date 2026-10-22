import { safePrimeGroup, SraGroup } from '@app/modules/mental-poker/classes/sra-cipher';

/** A safe prime of 129 bits, for the specs of the decks to run fast */
export const TEST_GROUP: SraGroup = safePrimeGroup(BigInt('0x1000000000000000000000000000030a3'));
