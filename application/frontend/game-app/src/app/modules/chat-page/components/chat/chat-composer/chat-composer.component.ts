import { Component, inject, input, output } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { TextAreaFieldComponent } from '@app/modules/form/text-area-field/text-area-field.component';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { TranslatableText } from '@app/types/translatable-text.type';

// Safari ends the composition of a text before the keydown of the Enter confirming it, which no longer tells it composes
const COMPOSITION_END_DELAY: number = 100;

/**
 * The composer of a chat: the text area of the message and the button sending it. Enter sends, or starts a new line by
 * the setting of the chat; the parent holds the form, and checks whether it may send when told to
 */
@Component({
    selector: 'app-chat-composer',
    templateUrl: './chat-composer.component.html',
    imports: [MatIcon, MatIconButton, TextAreaFieldComponent, TranslocoPipe],
    host: {
        class: 'block',
    },
})
export class ChatComposerComponent {
    private readonly preferences = inject(ChatPreferencesService);

    /** The field of the message, of the form of the parent */
    public readonly field = input.required<FieldTree<string>>();
    /** Translated, the label of the text area */
    public readonly label = input.required<string>();
    /** Translated, the label of the button sending */
    public readonly sendLabel = input.required<string>();
    /** Why the composer does not send, shown under the text area */
    public readonly hint = input<TranslatableText>();
    /** The button sending is disabled: Enter still tells the parent, which checks it */
    public readonly disabled = input<boolean>(false);
    public readonly formId = input<string>('send-form');
    public readonly sendId = input<string>('send');
    /** The message is to send: by the button, or by the keyboard */
    public readonly send = output<void>();

    private compositionEndedAt: number = Number.NEGATIVE_INFINITY;

    protected onCompositionEnd(event: CompositionEvent): void {
        this.compositionEndedAt = event.timeStamp;
    }

    /** Enter sends the message, or a new line by the setting: Shift starts a new line, Ctrl or Cmd sends */
    protected onKey(event: KeyboardEvent): void {
        // A key typing an accent or an ideogram belongs to the text being composed, the Enter confirming it included
        const composing: boolean = event.isComposing || event.timeStamp - this.compositionEndedAt < COMPOSITION_END_DELAY;
        if (event.key !== 'Enter' || composing || event.shiftKey) {
            return;
        }
        if (event.ctrlKey || event.metaKey || this.preferences.enterSends.on()) {
            event.preventDefault();
            this.send.emit();
        }
    }
}
