import { Component, input, output } from '@angular/core';

export type ConfirmDialogButtonLabels = 'yes-no' | 'confirm-cancel';

@Component({
    selector: 'app-confirm-dialog',
    template: `
<p class="mb-2">{{ description() }}</p>
<div class="flex gap-2 flex-wrap ml-auto">
    <!-- <app-button class="block! min-w-[100px]" (click)="result.emit(false)" secondary>
        {{ buttonLabels() === 'yes-no' ? 'Non' : 'Annuler' }}
        </app-button>
        <app-button class="block! min-w-[100px]" (click)="result.emit(true)">
        {{ buttonLabels() === 'yes-no' ? 'Oui' : 'Confirmer' }}
        </app-button> -->
</div>
  `,
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
