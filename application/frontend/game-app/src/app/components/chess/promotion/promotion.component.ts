import { Component, Input, Output, EventEmitter } from '@angular/core';
import { PieceColor, PieceType, FenPiece } from '../../../classes/chess/rules/chess-rules';

@Component({
    selector: 'app-chess-promotion',
    templateUrl: './promotion.component.html',
    styleUrls: ['./promotion.component.scss']
})
export class PromotionComponent {

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

    @Input() public color: PieceColor;
    @Output() public pieceType: EventEmitter<PieceType> = new EventEmitter();

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
        const pieceMap: Map<PieceType, FenPiece> = this.color === PieceColor.WHITE ? PromotionComponent.whitePieces : PromotionComponent.blackPieces;
        if (pieceMap.has(pieceType)) {
            return pieceMap.get(pieceType);
        }
        return FenPiece.EMPTY;
    }

    public onClick(pieceType: PieceType): void {
        this.pieceType.emit(pieceType);
    }
}
