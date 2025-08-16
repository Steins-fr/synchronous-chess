import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';
import { homePath, chatPath } from './app.routes';

@Component({
    selector: 'app-root',
    imports: [CommonModule, RouterOutlet, RouterModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
    public title: string = 'synchronous-chess';

    public homePath: string = `/${homePath}`;
    public chatPath: string = `/${chatPath}`;
}
