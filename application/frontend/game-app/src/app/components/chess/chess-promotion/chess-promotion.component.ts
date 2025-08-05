
import { Component, input, output } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { PieceColor, PieceType, FenPiece } from '@app/classes/chess/rules/chess-rules';
import { ChessPieceComponent } from '@app/components/chess/chess-piece/chess-piece.component';

@Component({
    selector: 'app-chess-promotion',
    templateUrl: './chess-promotion.component.html',
    styleUrls: ['./chess-promotion.component.scss'],
    imports: [MatGridListModule, ChessPieceComponent],
})
export class ChessPromotionComponent {

    private static readonly whitePieces: Map<PieceType, FenPiece> = new Map<PieceType, FenPiece>([
        [PieceType.BISHOP, FenPiece.WHITE_BISHOP],
        [PieceType.KNIGHT, FenPiece.WHITE_KNIGHT],
        [PieceType.QUEEN, FenPiece.WHITE_QUEEN],
        [PieceType.ROOK, FenPiece.WHITE_ROOK]
    ]);

    private static readonly blackPieces: Map<PieceType, FenPiece> = new Map<PieceType, FenPiece>([
        [PieceType.BISHOP, FenPiece.BLACK_BISHOP],
        [PieceType.KNIGHT, FenPiece.BLACK_KNIGHT],
        [PieceType.QUEEN, FenPiece.BLACK_QUEEN],
        [PieceType.ROOK, FenPiece.BLACK_ROOK]
    ]);

    public readonly color = input.required<PieceColor>();
    public readonly pieceType = output<PieceType>();

    public get rookType(): PieceType {
        return PieceType.ROOK;
    }

    public get knightType(): PieceType {
        return PieceType.KNIGHT;
    }

    public get bishopType(): PieceType {
        return PieceType.BISHOP;
    }

    public get queenType(): PieceType {
        return PieceType.QUEEN;
    }

    public piece(pieceType: PieceType): FenPiece {
        const pieceMap: Map<PieceType, FenPiece> = this.color() === PieceColor.WHITE ? ChessPromotionComponent.whitePieces : ChessPromotionComponent.blackPieces;
        return pieceMap.get(pieceType) ?? FenPiece.EMPTY;
    }

    public onClick(pieceType: PieceType): void {
        this.pieceType.emit(pieceType);
    }
}
