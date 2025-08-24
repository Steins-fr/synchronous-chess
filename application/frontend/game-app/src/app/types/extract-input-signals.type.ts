import { InputSignal } from '@angular/core';

export type ExtractInputSignals<T> = {
    [K in keyof T as T[K] extends InputSignal<any>
        ? K
        : never]: T[K] extends InputSignal<infer U> ? U : never;
};

/**
 * Extract all properties of a component that are an input.
 *
 * Use to ensure that .setInput() only uses keys that are valid
 *
 * @example
 * typescript
 * dynamicComponent.setInput('inputName' satisfies InputSignalKeysOf<DynamicComponent>, value);
 *
 */
export type InputSignalKeysOf<T> = keyof ExtractInputSignals<T>;
