import { Component, inject, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { RoomHistoryComponent } from '@app/modules/room-layout/room-history/room-history.component';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { privateBlockChains, PrivatePayloads } from '@app/modules/private-conversations/classes/private-messages';
import { fixedRouletteBlockChains, FixedRoulettePayloads } from '../../classes/game-sessions/fixed-roulette-messages';
import { FixedPresentationComponent } from '../../components/fixed-presentation/fixed-presentation.component';
import { FixedRulesComponent } from '../../components/fixed-rules/fixed-rules.component';
import { FixedTableComponent } from '../../components/fixed-table/fixed-table.component';

/** The page of the Fixed Roulette: its rooms, each one holding a table, the chat and the conversation of the players */
@Component({
    selector: 'app-fixed-roulette',
    templateUrl: './fixed-roulette.html',
    imports: [RoomLayoutComponent, RoomHistoryComponent, FixedPresentationComponent, FixedRulesComponent, FixedTableComponent, TranslocoPipe],
    providers: [provideRooms()],
})
export class FixedRoulette implements MatchPage {
    protected readonly game: RoomGame = RoomGame.FIXED_ROULETTE;
    // The 2 players and their spectators
    protected readonly maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads & PrivatePayloads & FixedRoulettePayloads>(
        this.maxPlayer,
        mergeBlockChainRoutings(mergeBlockChainRoutings(chatBlockChains, privateBlockChains), fixedRouletteBlockChains),
    );
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
    // By its reference: its history and its private conversations given to the panel of the room
    protected readonly table = viewChild<FixedTableComponent>('fixedTable');
}
