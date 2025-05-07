import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, input } from '@angular/core';

export interface ChatMessage {
    message: string;
    author: string;
    isSelf: boolean;
}

@Component({
    selector: 'app-chat-message',
    imports: [
        CommonModule,
    ],
    templateUrl: './chat-message.component.html',
    styleUrl: './chat-message.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
    public readonly message = input.required<ChatMessage>();
}
