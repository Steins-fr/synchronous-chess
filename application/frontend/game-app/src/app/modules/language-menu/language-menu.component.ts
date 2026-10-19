import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { Language } from '@app/services/language/enums/language.enum';
import { LANGUAGE_NAMES } from '@app/services/language/language-names';
import { LanguageService } from '@app/services/language/language.service';

type LanguageItem = {
    code: Language;
    name: string;
};

// The languages of the menu, each named in itself
const languages: ReadonlyArray<Readonly<LanguageItem>> = Object.entries(LANGUAGE_NAMES)
    .map(([code, name]: [string, string]) => ({ code: code as Language, name }));

/** Switches the language of the app, live: also during a match */
@Component({
    selector: 'app-language-menu',
    templateUrl: './language-menu.component.html',
    imports: [MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, TranslocoPipe],
})
export class LanguageMenuComponent {
    protected readonly languages: ReadonlyArray<Readonly<LanguageItem>> = languages;
    protected readonly languageService = inject(LanguageService);
}
