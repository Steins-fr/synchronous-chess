import { afterNextRender, Component, DestroyRef, EnvironmentInjector, inject, input, TemplateRef } from '@angular/core';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Room } from '@app/services/room-manager/classes/room/room';
import { WebrtcDebugComponent } from '../webrtc-debug/webrtc-debug.component';

/** The floating button of the pages of a room, opening the debug panel of WebRTC in a bottom sheet: developer tooling */
@Component({
    selector: 'app-debug-webrtc-button',
    templateUrl: './webrtc-debug-button.component.html',
    imports: [MatIconButton, MatIcon, WebrtcDebugComponent],
})
export class WebrtcDebugButtonComponent<M extends object> {
    /** The room whose connections the panel lists */
    public readonly room = input.required<Room<M>>();

    private readonly bottomSheet = inject(MatBottomSheet);
    private sheet?: MatBottomSheetRef<unknown>;

    public constructor() {
        // The injector of the app: the one of the button is gone with it
        const injector: EnvironmentInjector = inject(EnvironmentInjector);
        // The room given up (a join failed, the player left) or the page left: the sheet goes with its button. A navigation
        // of the router keeps the overlays open, and nothing closes a sheet whose opener is destroyed. Once rendered: the
        // change detection removing the button has checked the sheet already
        inject(DestroyRef).onDestroy(() => {
            const sheet: MatBottomSheetRef<unknown> | undefined = this.sheet;
            if (sheet) {
                afterNextRender(() => sheet.dismiss(), { injector });
            }
        });
    }

    protected open(panel: TemplateRef<unknown>): void {
        // The focus back on the button once closed, even where a click does not focus a button (Safari)
        this.sheet = this.bottomSheet.open(panel, { ariaLabel: 'WebRTC debug', restoreFocus: '#webrtc-debug-open' });
    }

    /** Closed from within: on a phone the sheet covers its button, the only sheet of the app */
    protected close(): void {
        this.bottomSheet.dismiss();
    }
}
