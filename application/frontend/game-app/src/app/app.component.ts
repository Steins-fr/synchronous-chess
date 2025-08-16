import { ChangeDetectionStrategy, Component } from '@angular/core';

import { RouterOutlet, RouterModule } from '@angular/router';
import { homePath, chatPath } from './app.routes';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
    protected readonly title: string = 'synchronous-chess';

    protected readonly homePath: string = `/${homePath}`;
    protected readonly chatPath: string = `/${chatPath}`;
}
