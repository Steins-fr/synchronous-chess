import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { bidPokerBlockChains, BidPokerPayloads } from '../../classes/game-sessions/bid-poker-messages';
import { BidPresentationComponent } from '../../components/bid-presentation/bid-presentation.component';
import { BidRulesComponent } from '../../components/bid-rules/bid-rules.component';

/** The page of the Bid Poker: its rooms, each one holding a table and the chat */
@Component({
    selector: 'app-bid-poker',
    templateUrl: './bid-poker.html',
    imports: [RoomLayoutComponent, BidPresentationComponent, BidRulesComponent, TranslocoPipe],
    providers: [provideRooms()],
})
export class BidPoker implements MatchPage {
    protected readonly game: RoomGame = RoomGame.BID_POKER;
    // The 8 seats: the WebRTC mesh of a room holds 8 pages on a phone, the spectators taking the seats left
    protected readonly maxPlayer: number = 8;
    public readonly room = roomFromSetup<ChatPayloads & BidPokerPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, bidPokerBlockChains));
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
}
