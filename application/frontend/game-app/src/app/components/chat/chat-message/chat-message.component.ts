import { CommonModule } from '@angular/common';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

export interface ChatMessage {
    message: string;
    author: string;
    isSelf: boolean;
}

@Component({
    selector: 'app-chat-message',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './chat-message.component.html',
    styleUrl: './chat-message.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
    @Input({ required: true }) public message!: ChatMessage;
}
