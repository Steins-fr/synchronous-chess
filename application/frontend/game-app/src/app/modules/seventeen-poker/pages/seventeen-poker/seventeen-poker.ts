import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { pokerBlockChains, PokerPayloads } from '../../classes/game-sessions/seventeen-poker-session';
import { PokerPresentationComponent } from '../../components/poker-presentation/poker-presentation.component';
import { PokerRulesComponent } from '../../components/poker-rules/poker-rules.component';
import { PokerTableComponent } from '../../components/poker-table/poker-table.component';

/** The page of the Seventeen Poker: its rooms, each one holding a table and the chat */
@Component({
    selector: 'app-seventeen-poker',
    templateUrl: './seventeen-poker.html',
    imports: [
        RoomLayoutComponent, PokerPresentationComponent, PokerRulesComponent, PokerTableComponent,
        TranslocoPipe,
    ],
    providers: [provideRooms()],
})
export class SeventeenPoker implements MatchPage {
    protected readonly game: RoomGame = RoomGame.SEVENTEEN_POKER;
    // The 2 players and their spectators
    protected readonly maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads & PokerPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, pokerBlockChains));
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
}
