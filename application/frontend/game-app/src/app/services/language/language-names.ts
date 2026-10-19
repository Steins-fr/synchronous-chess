import { Language } from './enums/language.enum';

// Each language named in itself, as the language menu lists it: these names are not translated
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
    [Language.EN]: 'English',
    [Language.FR]: 'Français',
    [Language.ES]: 'Español',
    [Language.PT_BR]: 'Português (Brasil)',
    [Language.PT_PT]: 'Português (Portugal)',
    [Language.DE]: 'Deutsch',
    [Language.RU]: 'Русский',
    [Language.TR]: 'Türkçe',
};
