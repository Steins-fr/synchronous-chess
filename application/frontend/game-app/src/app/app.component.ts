import { Component } from '@angular/core';

import { RouterModule, RouterOutlet } from '@angular/router';
import { chatPath, homePath } from './app.routes';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent {
    protected readonly title: string = 'synchronous-chess';

    protected readonly homePath: string = `/${homePath}`;
    protected readonly chatPath: string = `/${chatPath}`;
}
