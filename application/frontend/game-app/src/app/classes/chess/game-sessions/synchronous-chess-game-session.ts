import { NgZone } from '@angular/core';
import { PieceColor } from '../rules/chess-rules';
import SynchronousChessGame, { Position } from '../games/synchronous-chess-game';
import { FenBoard } from 'src/app/helpers/chess-board-helper';

export interface SessionConfiguration {
    whitePlayer?: string;
    blackPlayer?: string;
    spectatorNumber: number;
}

export default abstract class SynchronousChessGameSession {

    public readonly game: SynchronousChessGame = new SynchronousChessGame();
    public configuration: SessionConfiguration = { spectatorNumber: 0 };

    public constructor(protected readonly ngZone: NgZone) {
    }

    public abstract get playerColor(): PieceColor;

    public get spectatorNumber(): number {
        return this.configuration.spectatorNumber;
    }

    public get board(): FenBoard {
        return this.game.fenBoard;
    }

    public play(from: Position, to: Position): boolean {
        return this.game.applyPlay(from, to);
    }
}
