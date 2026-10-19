
import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface ChatMessage {
    message: string;
    author: string;
    isSelf: boolean;
}

@Component({
    selector: 'app-chat-message',
    imports: [TranslocoPipe],
    templateUrl: './chat-message.component.html',
    styleUrl: './chat-message.component.scss',
})
export class ChatMessageComponent {
    public readonly message = input.required<ChatMessage>();
}
