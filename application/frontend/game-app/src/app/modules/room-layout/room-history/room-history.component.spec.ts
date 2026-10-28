import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, test } from 'vitest';
import { PastResult } from './past-result';
import { RoomHistoryComponent } from './room-history.component';

describe('RoomHistoryComponent', () => {
    let fixture: ComponentFixture<RoomHistoryComponent>;

    function query(selector: string): HTMLElement | null {
        return fixture.nativeElement.querySelector(selector);
    }

    function lines(selector: string): ReadonlyArray<string> {
        return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(`${selector} li`))
            .map((line: HTMLElement) => line.textContent.replaceAll(/\s+/g, ' ').trim());
    }

    beforeEach(async () => {
        // The texts are keys, translated by the history
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setTranslationKey('test.move', 'Move {number}');
        transloco.setTranslationKey('test.match', 'Match {number}:');
        transloco.setTranslationKey('test.result', '{winner} wins');
        transloco.setTranslationKey('test.checked', 'Checked.');
        fixture = TestBed.createComponent(RoomHistoryComponent);
        fixture.componentRef.setInput('currentTitle', 'Hands');
        fixture.componentRef.setInput('current', []);
        await fixture.whenStable();
    });

    test('should show the moves of the match in progress only, without the title of the former ones', async () => {
        // Then: none yet
        expect(query('#history-current h3')?.textContent).toEqual('Hands');
        expect(query('#history-current p')?.textContent).toEqual('Nothing yet.');
        expect(query('#history-current ul')).toBeNull();
        expect(query('#history-past')).toBeNull();

        // When
        fixture.componentRef.setInput('current', [{ key: 'test.move', params: { number: 2 } }, { key: 'test.move', params: { number: 1 } }]);
        await fixture.whenStable();

        // Then: the latest first
        expect(lines('#history-current')).toEqual(['Move 2', 'Move 1']);
        expect(query('#history-current p')).toBeNull();
        expect(query('#history-past')).toBeNull();
    });

    test('should show the results of the former matches under their title, with their checks', async () => {
        // When
        fixture.componentRef.setInput('pastTitle', 'Matches played');
        await fixture.whenStable();

        // Then: none yet
        expect(query('#history-past h3')?.textContent).toEqual('Matches played');
        expect(query('#history-past p')?.textContent).toEqual('Nothing yet.');
        expect(query('#history-past ul')).toBeNull();

        // When: the check of the latest one pending
        const results: ReadonlyArray<PastResult> = [
            { number: 2, label: { key: 'test.match', params: { number: 2 } }, text: { key: 'test.result', params: { winner: 'bob' } }, verification: null },
            { number: 1, label: { key: 'test.match', params: { number: 1 } }, text: { key: 'test.result', params: { winner: 'alice' } }, verification: { key: 'test.checked' } },
        ];
        fixture.componentRef.setInput('past', results);
        await fixture.whenStable();

        // Then
        expect(lines('#history-past')).toEqual(['Match 2: bob wins', 'Match 1: alice wins Checked.']);
        expect(query('#history-past p')).toBeNull();
        const checks: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('#history-past li span.muted-note');
        expect(checks).toHaveLength(1);
        expect(checks[0].textContent).toEqual('Checked.');
        // The moves of the match in progress still shown, apart
        expect(query('#history-current p')?.textContent).toEqual('Nothing yet.');
    });
});
