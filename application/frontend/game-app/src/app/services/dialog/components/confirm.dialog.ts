import { Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

export type ConfirmDialogButtonLabels = 'yes-no' | 'confirm-cancel';

@Component({
    selector: 'app-confirm-dialog',
    templateUrl: './confirm.dialog.html',
    imports: [MatButton, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'flex flex-col gap-2',
    },
})
export class ConfirmDialog {
    public readonly result = output<boolean>();

    /** The key of the question */
    public readonly description = input.required<string>();
    public readonly buttonLabels = input<ConfirmDialogButtonLabels>('yes-no');
}
