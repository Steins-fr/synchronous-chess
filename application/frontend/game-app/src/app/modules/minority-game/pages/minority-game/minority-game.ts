import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { minorityBlockChains, MinorityPayloads } from '../../classes/game-sessions/minority-messages';
import { MinorityPresentationComponent } from '../../components/minority-presentation/minority-presentation.component';
import { MinorityRulesComponent } from '../../components/minority-rules/minority-rules.component';

/** The page of the Minority Game: its rooms, each one holding a table and the chat */
@Component({
    selector: 'app-minority-game',
    templateUrl: './minority-game.html',
    imports: [RoomLayoutComponent, MinorityPresentationComponent, MinorityRulesComponent, TranslocoPipe],
    providers: [provideRooms()],
})
export class MinorityGame implements MatchPage {
    protected readonly game: RoomGame = RoomGame.MINORITY_GAME;
    // The 8 seats: the WebRTC mesh of a room holds 8 pages on a phone, the spectators taking the seats left
    protected readonly maxPlayer: number = 8;
    public readonly room = roomFromSetup<ChatPayloads & MinorityPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, minorityBlockChains));
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
}
