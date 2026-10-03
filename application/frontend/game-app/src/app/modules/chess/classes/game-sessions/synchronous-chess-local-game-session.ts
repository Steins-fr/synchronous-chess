import { Signal, signal } from '@angular/core';
import { PieceColor } from '../../enums/piece-color.enum';
import SynchronousChessGameSession from './synchronous-chess-game-session';

export default class SynchronousChessLocalGameSession extends SynchronousChessGameSession {

    public myColor: PieceColor = PieceColor.NONE;
    public readonly spectatorNumber: Signal<number> = signal(0).asReadonly();
    public readonly seatsOpen: Signal<boolean> = signal(false).asReadonly();

    public get playingColor(): PieceColor {
        return PieceColor.NONE;
    }

    public takeSeat(): void {
        // Nothing to do
    }

    public leaveSeat(): void {
        // Nothing to do
    }

    public move(): void {
        // Nothing to do
    }

    public skip(): void {
        // Nothing to do
    }

    public promote(): void {
        // Nothing to do
    }

    public override destroy(): void {
        // Nothing to do
    }
}
