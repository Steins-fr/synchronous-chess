import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { rouletteBlockChains, RoulettePayloads } from '../../classes/game-sessions/russian-roulette-session';
import { RoulettePresentationComponent } from '../../components/roulette-presentation/roulette-presentation.component';
import { RouletteRulesComponent } from '../../components/roulette-rules/roulette-rules.component';
import { RouletteTableComponent } from '../../components/roulette-table/roulette-table.component';

/** The page of the 24-shot Russian roulette: its rooms, each one holding a table and the chat */
@Component({
    selector: 'app-russian-roulette',
    templateUrl: './russian-roulette.html',
    imports: [
        RoomLayoutComponent, RoulettePresentationComponent, RouletteRulesComponent, RouletteTableComponent,
        TranslocoPipe,
    ],
    providers: [provideRooms()],
})
export class RussianRoulette implements MatchPage {
    protected readonly game: RoomGame = RoomGame.RUSSIAN_ROULETTE;
    // The 2 players and their spectators
    protected readonly maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads & RoulettePayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, rouletteBlockChains));
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
}
