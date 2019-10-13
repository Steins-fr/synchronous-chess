import { Component } from '@angular/core';
import { dualChatPath, homePath, simpleChatPath } from './app-routing.module';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
    public title: string = 'synchronous-chess';

    public homePath: string = `/${homePath}`;
    public dualChatPath: string = `/${dualChatPath}`;
    public simpleChatPath: string = `/${simpleChatPath}`;
}
