import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterModule, RouterOutlet } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { LanguageMenuComponent } from '@app/modules/language-menu/language-menu.component';
import { PageLoaderComponent } from '@app/modules/page-loader/page-loader.component';
import { SoundMenuComponent } from '@app/modules/sound-menu/sound-menu.component';
import { ThemeModeEnum } from '@app/services/theme/enums/theme-mode.enum';
import { ShownTheme, ThemeService } from '@app/services/theme/theme.service';
import { chatPath, chessPath, homePath, pokerPath, roulettePath } from './app.routes';

type ThemeButton = {
    icon: string;
    // The key of its label
    label: string;
};

@Component({
    selector: 'app-root',
    imports: [
        RouterOutlet, RouterModule, MatIconButton, MatIcon, LanguageMenuComponent, SoundMenuComponent, PageLoaderComponent,
        TranslocoDirective, TranslocoPipe,
    ],
    templateUrl: './app.component.html',
    host: {
        class: 'flex h-dvh flex-col',
    },
})
export class AppComponent {
    // The button tells what a click does, by the theme shown: it shows the other one
    private static readonly themeButtons: Readonly<Record<ShownTheme, Readonly<ThemeButton>>> = {
        [ThemeModeEnum.LIGHT]: { icon: 'dark_mode', label: marker('app.theme.toDark') },
        [ThemeModeEnum.DARK]: { icon: 'light_mode', label: marker('app.theme.toLight') },
    };

    protected readonly title: string = 'synchronous-chess';

    protected readonly homePath: string = `/${homePath}`;
    protected readonly chessPath: string = `/${chessPath}`;
    protected readonly chatPath: string = `/${chatPath}`;
    protected readonly pokerPath: string = `/${pokerPath}`;
    protected readonly roulettePath: string = `/${roulettePath}`;

    protected readonly themeService = inject(ThemeService);
    protected readonly themeButton = computed<Readonly<ThemeButton>>(() => AppComponent.themeButtons[this.themeService.theme()]);
}
