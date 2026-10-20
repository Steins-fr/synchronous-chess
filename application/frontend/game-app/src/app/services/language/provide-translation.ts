import { EnvironmentProviders, inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { Language } from './enums/language.enum';
import { LanguageService } from './language.service';
import { TranslationLoader } from './translation.loader';

// The texts of the app, in the language of the user (LanguageService), with the plurals of ICU (messageformat)
export function provideTranslation(): EnvironmentProviders[] {
    return [
        ...provideTransloco({
            config: {
                availableLangs: Object.values(Language),
                defaultLang: Language.EN,
                reRenderOnLangChange: true,
                prodMode: !isDevMode(),
            },
            loader: TranslationLoader,
        }),
        provideTranslocoMessageformat(),
        // The first render already has the texts of the language, and never shows a key
        provideAppInitializer(() => inject(LanguageService).preload()),
    ];
}
