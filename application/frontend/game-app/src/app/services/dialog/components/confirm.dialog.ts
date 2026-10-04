import { Component, input, output } from '@angular/core';

export type ConfirmDialogButtonLabels = 'yes-no' | 'confirm-cancel';

@Component({
    selector: 'app-confirm-dialog',
    templateUrl: './confirm.dialog.html',
    imports: [],
    host: {
        class: 'flex flex-col gap-2',
    },
})
export class ConfirmDialog {
    public readonly result = output<boolean>();

    public readonly description = input.required<string>();
    public readonly buttonLabels = input<ConfirmDialogButtonLabels>('yes-no');
}
