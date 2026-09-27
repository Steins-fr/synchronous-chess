import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChessBoardComponent } from './chess-board.component';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { Column, Row } from '@app/modules/chess/interfaces/CoordinateMove';
import { ValidPlayBoard } from '@app/modules/chess/types/valid-play-board';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

describe('ChessBoardComponent', () => {
    let fixture: ComponentFixture<ChessBoardComponent>;
    let component: ChessBoardComponent;

    function cells(): HTMLElement[] {
        return Array.from(fixture.nativeElement.querySelectorAll('mat-grid-tile'));
    }

    function cellAt(x: number, y: number): HTMLElement {
        return cells()[y * 8 + x];
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChessBoardComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChessBoardComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('fenBoard', ChessBoardHelper.createFenBoard());
        fixture.componentRef.setInput('validPlayBoard', ChessBoardHelper.createFilledBoard(false));
        fixture.componentRef.setInput('grabColor', PieceColor.WHITE);
        fixture.componentRef.setInput('movePreview', undefined);
        await fixture.whenStable();
    });

    afterEach(() => {
        document.querySelectorAll('.cdk-drag-preview').forEach((element: Element) => element.remove());
    });

    test('should render the board with its pieces and labels', () => {
        expect(cells()).toHaveLength(64);
        expect(fixture.nativeElement.querySelectorAll('#board-grid app-chess-piece')).toHaveLength(32);
        expect(fixture.nativeElement.querySelector('.column-labels').textContent.replace(/\s/g, '')).toEqual('ABCDEFGH');
        expect(fixture.nativeElement.querySelector('.row-labels').textContent.replace(/\s/g, '')).toEqual('87654321');
    });

    test('should highlight the valid plays and reset them when the board changes', async () => {
        // Given
        const validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
        validPlayBoard[Row._4][Column.E] = true;

        // When
        fixture.componentRef.setInput('validPlayBoard', validPlayBoard);
        await fixture.whenStable();

        // Then
        expect(cellAt(Column.E, Row._4).classList).toContain('valid-move');

        // When
        fixture.componentRef.setInput('fenBoard', ChessBoardHelper.createFenBoard());
        await fixture.whenStable();

        // Then
        expect(component.validPlayBoard()[Row._4][Column.E]).toEqual(false);
        expect(fixture.nativeElement.querySelectorAll('.valid-move')).toHaveLength(0);
    });

    test('should highlight the move preview', async () => {
        // When
        fixture.componentRef.setInput('movePreview', { from: [Column.E, Row._2], to: [Column.E, Row._4] });
        await fixture.whenStable();

        // Then
        expect(component.isMovePreview(new Vec2(Column.E, Row._2))).toEqual(true);
        expect(component.isMovePreview(new Vec2(Column.E, Row._4))).toEqual(true);
        expect(component.isMovePreview(new Vec2(Column.E, Row._3))).toEqual(false);
        expect(fixture.nativeElement.querySelectorAll('.move-preview')).toHaveLength(2);

        // When
        fixture.componentRef.setInput('movePreview', undefined);
        await fixture.whenStable();

        // Then
        expect(component.fromPreview()).toBeNull();
        expect(component.toPreview()).toBeNull();
        expect(component.isMovePreview(new Vec2(Column.E, Row._2))).toEqual(false);
    });

    test('should only allow to drag the pieces of the grab color', () => {
        expect(component.canBeDragged(new Vec2(Column.E, Row._2))).toEqual(true);
        expect(component.canBeDragged(new Vec2(Column.E, Row._7))).toEqual(false);
        expect(fixture.nativeElement.querySelectorAll('.grab-available')).toHaveLength(16);
    });

    test('should emit the clicked piece position', () => {
        // Given
        const clicked: Vec2[] = [];
        component.pieceClicked.subscribe((position: Vec2) => clicked.push(position));

        // When
        (cellAt(Column.E, Row._2).querySelector('app-chess-piece') as HTMLElement).click();

        // Then
        expect(clicked).toEqual([new Vec2(Column.E, Row._2)]);
    });

    test('should follow the drag and drop of a piece', async () => {
        // Given
        const picked: Vec2[] = [];
        const dropped: Vec2[] = [];
        component.piecePicked.subscribe((position: Vec2) => picked.push(position));
        component.pieceDropped.subscribe((position: Vec2) => dropped.push(position));
        const drags = fixture.debugElement.queryAll(By.directive(CdkDrag));
        const dropLists = fixture.debugElement.queryAll(By.directive(CdkDropList));

        // When
        drags[8].triggerEventHandler('cdkDragStarted', {});
        dropLists[36].triggerEventHandler('cdkDropListEntered', {});
        await fixture.whenStable();

        // Then
        expect(picked).toEqual([new Vec2(0, 1)]);
        expect(component.pieceDragged()).toEqual(new Vec2(0, 1));
        expect(cellAt(0, 1).classList).toContain('dragged');
        expect(cellAt(4, 4).classList).toContain('drag-hover');
        expect(fixture.nativeElement.querySelector('#board-grid').classList).toContain('grabbing-cursor');

        // When
        dropLists[36].triggerEventHandler('cdkDropListDropped', {});
        await fixture.whenStable();

        // Then
        expect(dropped).toEqual([new Vec2(4, 4)]);
        expect(component.pieceDragged()).toEqual(new Vec2(-1, -1));
        expect(component.cellHovered()).toEqual(new Vec2(-1, -1));
    });

    test('should render the drag preview and placeholder while dragging', async () => {
        // Given
        const piece: HTMLElement = cellAt(Column.E, Row._2).querySelector('app-chess-piece') as HTMLElement;
        document.elementFromPoint ??= (): Element | null => null;

        // When
        piece.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0, button: 0, buttons: 1, detail: 1 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 50, buttons: 1 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 60, buttons: 1 }));
        await fixture.whenStable();

        // Then
        expect(document.querySelector('.piece-preview app-chess-piece')?.textContent).toEqual('♙');
        expect(fixture.nativeElement.querySelector('.hidden-placeholder')).not.toBeNull();
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 60, clientY: 60 }));
    });
});
