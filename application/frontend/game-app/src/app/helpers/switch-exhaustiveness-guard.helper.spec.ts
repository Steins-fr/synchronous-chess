import { describe, test, expect } from 'vitest';
import { switchExhaustivenessGuard } from './switch-exhaustiveness-guard.helper';

enum Fruit {
    APPLE = 'apple',
    PEAR = 'pear',
}

const fruitLabel = (fruit: Fruit): string => {
    switch (fruit) {
        case Fruit.APPLE:
            return 'Apple';
        case Fruit.PEAR:
            return 'Pear';
        default:
            return switchExhaustivenessGuard(fruit);
    }
};

describe('switchExhaustivenessGuard', () => {
    test('should not be reached when every case is handled', () => {
        // Given
        const fruit: Fruit = Fruit.PEAR;

        // When
        const label: string = fruitLabel(fruit);

        // Then
        expect(label).toBe('Pear');
    });

    test('should throw when an unhandled value reaches the default branch', () => {
        // Given
        const fruit: Fruit = 'banana' as Fruit;

        // When
        const call = (): string => fruitLabel(fruit);

        // Then
        expect(call).toThrow('Unhandled switch case: banana');
    });

    test('should reject a non exhaustive switch at compile time', () => {
        // Given
        const partialFruitLabel = (fruit: Fruit): string => {
            switch (fruit) {
                case Fruit.APPLE:
                    return 'Apple';
                default:
                    // @ts-expect-error Fruit.PEAR is not handled, so fruit is not narrowed to never
                    return switchExhaustivenessGuard(fruit);
            }
        };

        // When
        const call = (): string => partialFruitLabel(Fruit.PEAR);

        // Then
        expect(call).toThrow('Unhandled switch case: pear');
    });
});
