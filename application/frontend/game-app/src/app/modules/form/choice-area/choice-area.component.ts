import { Component, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';

/**
 * An option of a choice picked by clicking an area of the page: a radio button bound to a field of Signal Forms, unseen,
 * covering the component with its label, whose content names it. The options of a choice lie where the page
 * puts them, in a group it labels (`radiogroup`). The area tells it is clickable under the pointer, and its option once
 * picked
 */
@Component({
    selector: 'app-choice-area',
    imports: [FormField],
    templateUrl: './choice-area.component.html',
    styleUrl: './choice-area.component.scss',
    host: {
        class: 'block',
    },
})
export class ChoiceAreaComponent {
    public readonly field = input.required<FieldTree<string>>();
    /** The value of the field once the area is picked */
    public readonly value = input.required<string>();
    /** The form the radio button belongs to, when it lies out of it */
    public readonly formId = input<string | null>(null);
}
