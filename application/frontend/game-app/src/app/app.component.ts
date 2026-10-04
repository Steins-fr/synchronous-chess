import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterModule, RouterOutlet } from '@angular/router';
import { ThemeModeEnum } from '@app/services/theme/enums/theme-mode.enum';
import { ShownTheme, ThemeService } from '@app/services/theme/theme.service';
import { chatPath, homePath } from './app.routes';

type ThemeButton = {
    icon: string;
    label: string;
};

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterModule, MatIconButton, MatIcon],
    templateUrl: './app.component.html',
})
export class AppComponent {
    // The button tells what a click does, by the theme shown: it shows the other one
    private static readonly themeButtons: Readonly<Record<ShownTheme, Readonly<ThemeButton>>> = {
        [ThemeModeEnum.LIGHT]: { icon: 'dark_mode', label: 'Passer au thème sombre' },
        [ThemeModeEnum.DARK]: { icon: 'light_mode', label: 'Passer au thème clair' },
    };

    protected readonly title: string = 'synchronous-chess';

    protected readonly homePath: string = `/${homePath}`;
    protected readonly chatPath: string = `/${chatPath}`;

    protected readonly themeService = inject(ThemeService);
    protected readonly themeButton = computed<Readonly<ThemeButton>>(() => AppComponent.themeButtons[this.themeService.theme()]);
}
