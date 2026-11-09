import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { edenBlockChains, EdenPayloads } from '../../classes/game-sessions/eden-messages';
import { EdenPresentationComponent } from '../../components/eden-presentation/eden-presentation.component';
import { EdenRulesComponent } from '../../components/eden-rules/eden-rules.component';

/** The page of the Garden of Eden: its rooms, each one holding a table and the chat */
@Component({
    selector: 'app-garden-of-eden',
    templateUrl: './garden-of-eden.html',
    imports: [RoomLayoutComponent, EdenPresentationComponent, EdenRulesComponent, TranslocoPipe],
    providers: [provideRooms()],
})
export class GardenOfEden implements MatchPage {
    protected readonly game: RoomGame = RoomGame.GARDEN_OF_EDEN;
    // The 8 seats: the WebRTC mesh of a room holds 8 pages on a phone, the spectators taking the seats left
    protected readonly maxPlayer: number = 8;
    public readonly room = roomFromSetup<ChatPayloads & EdenPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, edenBlockChains));
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
}
