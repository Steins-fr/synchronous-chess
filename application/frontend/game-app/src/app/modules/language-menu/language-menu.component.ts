import { Component, inject, Signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { heldFor, LOADER_DELAY } from '@app/helpers/signal.helper';
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

/** Switches the language of the app, live: also during a match. A ring turns around its icon while a language picked loads long */
@Component({
    selector: 'app-language-menu',
    templateUrl: './language-menu.component.html',
    imports: [MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatProgressSpinner, TranslocoPipe],
})
export class LanguageMenuComponent {
    protected readonly languages: ReadonlyArray<Readonly<LanguageItem>> = languages;
    protected readonly languageService = inject(LanguageService);
    protected readonly loading: Signal<boolean> = heldFor(this.languageService.switching, LOADER_DELAY);
}
