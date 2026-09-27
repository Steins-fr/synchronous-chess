/**
 * Use as the `default` branch of a switch to make the compiler reject any unhandled case:
 * once every case is covered the value narrows to `never`, otherwise the call fails to type-check.
 * Throws at runtime if an unexpected value still reaches it (e.g. untyped data from the network).
 */
export const switchExhaustivenessGuard = (value: never): never => {
    throw new Error(`Unhandled switch case: ${String(value)}`);
};
