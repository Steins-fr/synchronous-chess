import { Component, input } from '@angular/core';
import { Apple } from '../../classes/rules/eden-rules';

/** An apple of the garden, in its color: decorative, the text beside it names it */
@Component({
    selector: 'app-eden-apple',
    templateUrl: './eden-apple.component.html',
    host: {
        class: 'inline-block shrink-0',
        'aria-hidden': 'true',
        '[class.text-app-apple-gold]': 'apple() === apples.GOLD',
        '[class.text-app-apple-silver]': 'apple() === apples.SILVER',
        '[class.text-app-apple-red]': 'apple() === apples.RED',
    },
})
export class EdenAppleComponent {
    public readonly apple = input.required<Apple>();
    protected readonly apples = Apple;
}
