import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { SnackBarDataInterface } from '../interfaces/snack-bar-data.interface';

@Component({
    selector: 'app-snack-bar',
    templateUrl: './snack-bar.component.html',
    styleUrls: ['./snack-bar.component.scss'],
    imports: [TranslocoPipe],
})
export class SnackBarComponent {
    protected readonly data: SnackBarDataInterface = inject(MAT_SNACK_BAR_DATA);
}
