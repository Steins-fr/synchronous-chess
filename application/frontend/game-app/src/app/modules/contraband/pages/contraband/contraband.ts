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
import { contrabandBlockChains, ContrabandPayloads } from '../../classes/game-sessions/contraband-messages';
import { ContrabandPresentationComponent } from '../../components/contraband-presentation/contraband-presentation.component';
import { ContrabandRulesComponent } from '../../components/contraband-rules/contraband-rules.component';
import { ContrabandTableComponent } from '../../components/contraband-table/contraband-table.component';

/** The page of the Contraband: its rooms, each one holding a table, the chat and the private conversations of the match */
@Component({
    selector: 'app-contraband',
    templateUrl: './contraband.html',
    imports: [RoomLayoutComponent, RoomHistoryComponent, ContrabandPresentationComponent, ContrabandRulesComponent, ContrabandTableComponent, TranslocoPipe],
    providers: [provideRooms()],
})
export class Contraband implements MatchPage {
    protected readonly game: RoomGame = RoomGame.CONTRABAND;
    // The 8 seats, 4 for each country: the WebRTC mesh of a room holds 8 pages on a phone, the spectators taking the seats left
    protected readonly maxPlayer: number = 8;
    public readonly room = roomFromSetup<ChatPayloads & PrivatePayloads & ContrabandPayloads>(
        this.maxPlayer,
        mergeBlockChainRoutings(mergeBlockChainRoutings(chatBlockChains, privateBlockChains), contrabandBlockChains),
    );
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
    // By its reference: its history and its private conversations given to the panel of the room
    protected readonly table = viewChild<ContrabandTableComponent>('contrabandTable');
}
