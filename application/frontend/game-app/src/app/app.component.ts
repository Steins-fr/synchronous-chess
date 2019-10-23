import { Component } from '@angular/core';
import { homePath, chatPath } from './app-routing.module';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
    public title: string = 'synchronous-chess';

    public homePath: string = `/${homePath}`;
    public chatPath: string = `/${chatPath}`;
}
