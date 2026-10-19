import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';
import { SnackBarTypeEnum } from './enums/snack-bar-type.enum';
import { SnackBarDataInterface } from './interfaces/snack-bar-data.interface';
import { SnackBarComponent } from './snack-bar/snack-bar.component';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('NotificationService', () => {
    let service: NotificationService;
    let snackBar: MatSnackBar;
    let dismissed: Subject<void>[];

    function openedContents(): string[] {
        return vi.mocked(snackBar.openFromComponent).mock.calls.map((call) => (call[1]?.data as SnackBarDataInterface).content.key);
    }

    beforeEach(() => {
        dismissed = [];
        snackBar = TestHelper.cast<MatSnackBar>({
            openFromComponent: vi.fn(() => {
                const afterDismissed = new Subject<void>();
                dismissed.push(afterDismissed);
                return { afterDismissed: () => afterDismissed };
            }),
        });
        TestBed.configureTestingModule({
            providers: [{ provide: MatSnackBar, useValue: snackBar }],
        });
        service = TestBed.inject(NotificationService);
    });

    test('openSnackBar should open an info snack bar by default', () => {
        // When
        service.openSnackBar({ key: 'hello' });

        // Then
        expect(snackBar.openFromComponent).toHaveBeenCalledWith(SnackBarComponent, {
            duration: 4000,
            panelClass: SnackBarTypeEnum.INFO,
            data: { content: { key: 'hello' } },
        });
    });

    test('should expose a shortcut for each snack bar type', () => {
        // When
        service.error({ key: 'error' }, 1);
        dismissed[0].next();
        service.success({ key: 'success' });
        dismissed[1].next();
        service.info({ key: 'info' }, 2);

        // Then
        expect(snackBar.openFromComponent).toHaveBeenNthCalledWith(1, SnackBarComponent, { duration: 1000, panelClass: SnackBarTypeEnum.ERROR, data: { content: { key: 'error' } } });
        expect(snackBar.openFromComponent).toHaveBeenNthCalledWith(2, SnackBarComponent, { duration: 4000, panelClass: SnackBarTypeEnum.SUCCESS, data: { content: { key: 'success' } } });
        expect(snackBar.openFromComponent).toHaveBeenNthCalledWith(3, SnackBarComponent, { duration: 2000, panelClass: SnackBarTypeEnum.INFO, data: { content: { key: 'info' } } });
    });

    test('should queue the snack bars opened while another one is displayed', () => {
        // Given
        service.info({ key: 'first' });

        // When
        service.info({ key: 'first' });
        service.info({ key: 'second' });
        service.info({ key: 'second' });
        service.error({ key: 'second' });
        service.info({ key: 'second' }, 1);
        service.info({ key: 'second', params: { name: 'bob' } });
        service.info({ key: 'second', params: { name: 'bob' } });

        // Then
        expect(openedContents()).toEqual(['first']);

        // When
        dismissed[0].next();
        dismissed[1].next();
        dismissed[2].next();
        dismissed[3].next();
        dismissed[4].next();

        // Then
        expect(openedContents()).toEqual(['first', 'second', 'second', 'second', 'second']);
        expect(vi.mocked(snackBar.openFromComponent).mock.calls.map((call) => call[1]?.panelClass)).toEqual([
            SnackBarTypeEnum.INFO, SnackBarTypeEnum.INFO, SnackBarTypeEnum.ERROR, SnackBarTypeEnum.INFO, SnackBarTypeEnum.INFO,
        ]);
        expect((vi.mocked(snackBar.openFromComponent).mock.calls[4][1]?.data as SnackBarDataInterface).content.params).toEqual({ name: 'bob' });
    });
});
