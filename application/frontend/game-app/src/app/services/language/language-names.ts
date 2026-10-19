import { Language } from './enums/language.enum';

// Each language named in itself, as the language menu lists it: these names are not translated
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
    [Language.EN]: 'English',
    [Language.FR]: 'Français',
};
