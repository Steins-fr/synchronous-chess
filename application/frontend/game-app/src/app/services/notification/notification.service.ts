import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SnackBarTypeEnum } from './enums/snack-bar-type.enum';
import { SnackBarDataInterface } from './interfaces/snack-bar-data.interface';
import { SnackBarComponent } from './snack-bar/snack-bar.component';

type SnackBarQueueItem = {
    content: string;
    type: SnackBarTypeEnum;
    duration: number;
};

@Injectable({
    providedIn: 'root',
})
export class NotificationService {
    private readonly duration: number = 4;
    private readonly queue: SnackBarQueueItem[] = [];
    private openedItem: SnackBarQueueItem | null = null;
    private readonly snackBar = inject(MatSnackBar);

    public openSnackBar(
        content: string,
        type: SnackBarTypeEnum = SnackBarTypeEnum.INFO,
        duration: number = this.duration,
    ): void {
        if (this.openedItem) {
            this.pushToQueueIfNotExists({ content, type, duration });
            return;
        }

        this.openedItem = { content, type, duration };

        const defaultOptions: SnackBarDataInterface = {
            content,
        };

        this.snackBar
            .openFromComponent(SnackBarComponent, {
                duration: duration * 1000,
                panelClass: type,
                data: defaultOptions,
            })
            .afterDismissed()
            .subscribe(() => {
                this.openedItem = null;
                const next = this.queue.shift();

                if (next) {
                    this.openSnackBar(next.content, next.type, next.duration);
                }
            });
    }

    private itemsAreEqual(item1: SnackBarQueueItem | null, item2: SnackBarQueueItem | null): boolean {
        if (!item1 || !item2) {
            return false;
        }

        return item1.content === item2.content
        && item1.type === item2.type
        && item1.duration === item2.duration;
    }

    private pushToQueueIfNotExists(item: SnackBarQueueItem): void {
        if (!this.queue.find((queueItem: SnackBarQueueItem) => this.itemsAreEqual(queueItem, item)) && !this.itemsAreEqual(this.openedItem, item)) {
            this.queue.push(item);
        }
    }

    // TODO: color of snackbar
    public error(content: string, duration: number = this.duration): void {
        this.openSnackBar(content, SnackBarTypeEnum.ERROR, duration);
    }

    public success(content: string, duration: number = this.duration): void {
        this.openSnackBar(content, SnackBarTypeEnum.SUCCESS, duration);
    }

    public info(content: string, duration: number = this.duration): void {
        this.openSnackBar(content, SnackBarTypeEnum.INFO, duration);
    }
}
