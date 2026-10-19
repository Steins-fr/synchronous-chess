/**
 * A text translated where it is shown, in the language shown then: the key of its translation, with its params. A service
 * gives it rather than a translated text, which would not follow a change of the language
 */
export type TranslatableText = {
    readonly key: string;
    readonly params?: Readonly<Record<string, unknown>>;
};
