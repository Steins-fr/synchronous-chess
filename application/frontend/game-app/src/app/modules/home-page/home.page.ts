import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { chatPath, chessPath } from '@app/app.routes';

/** The landing page: a card per game, linking to its page */
@Component({
    selector: 'app-home-page',
    templateUrl: './home.page.html',
    imports: [RouterLink, MatIcon, TranslocoDirective],
})
export class HomePage {
    protected readonly chessPath: string = `/${ chessPath }`;
    protected readonly chatPath: string = `/${ chatPath }`;
}
