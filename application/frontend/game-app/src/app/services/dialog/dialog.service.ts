import {
    EventEmitter,
    inject,
    Injectable,
    Injector,
    OutputEmitterRef,
    Type,
} from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Subscription } from 'rxjs';
import { DialogWrapperComponent } from './components/dialog-wrapper.component';
import { ExtractInputSignals, InputSignalKeysOf } from '@app/types/extract-input-signals.type';
import { ConfirmDialog, ConfirmDialogButtonLabels } from './components/confirm.dialog';

type ExtractResult<T> = T extends { result: EventEmitter<infer U> }
    ? U
    : T extends { result: OutputEmitterRef<infer U> }
        ? U
        : void;

// Type to ensure that a key is a input on a component
type DialogWrapperComponentInputs = InputSignalKeysOf<
    DialogWrapperComponent<unknown>
>;

@Injectable({ providedIn: 'root' })
export class DialogService {
    private readonly overlay = inject(Overlay);
    private readonly injector = inject(Injector);

    public async confirm(
        title: string,
        message: string,
        buttonLabels: ConfirmDialogButtonLabels = 'yes-no'
    ): Promise<boolean> {
        const res = await this.open(ConfirmDialog, {
            title,
            inputs: {
                description: message,
                buttonLabels,
            },
        });
        return !!res;
    }

    public open<
        DialogContentComponent,
        DialogContentResult = ExtractResult<DialogContentComponent>
    >(
        component: Type<DialogContentComponent>,
        options?: {
            title?: string;
            closable?: boolean;
            inputs?: Partial<ExtractInputSignals<DialogContentComponent>>;
        }
    ): Promise<DialogContentResult | void> {
        const overlayRef: OverlayRef = this.overlay.create({
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-dark-backdrop',
            panelClass: 'dialog-overlay',
            positionStrategy: this.overlay
                .position()
                .global()
                .centerHorizontally()
                .centerVertically(),
            disposeOnNavigation: true,
        });

        const wrapperPortal = new ComponentPortal(
            DialogWrapperComponent as Type<
                DialogWrapperComponent<DialogContentComponent, DialogContentResult>
            >,
            null,
            this.injector
        );
        const wrapperRef = overlayRef.attach(wrapperPortal);

        const closable = options?.closable ?? true;

        // Pass component and inputs via signals (inputs)
        wrapperRef.setInput(
      'childComponent' satisfies DialogWrapperComponentInputs,
      component
        );
        wrapperRef.setInput(
      'childInputs' satisfies DialogWrapperComponentInputs,
      options?.inputs ?? {}
        );
        wrapperRef.setInput(
      'closable' satisfies DialogWrapperComponentInputs,
      closable
        );
        if (options?.title) {
            wrapperRef.setInput(
        'title' satisfies DialogWrapperComponentInputs,
        options?.title
            );
        }

        return new Promise<DialogContentResult | void>((resolve) => {
            const mainSubscription = new Subscription();

            // Result emission if exists and subscribable
            if (
                wrapperRef.instance.result instanceof EventEmitter ||
        wrapperRef.instance.result instanceof OutputEmitterRef
            ) {
                mainSubscription.add(
                    wrapperRef.instance.result.subscribe((value: DialogContentResult) => {
                        resolve(value);
                        mainSubscription.unsubscribe();
                        overlayRef.dispose();
                    })
                );
            }

            // Close interactions only if dialog is closable
            if (closable) {
                // Close button
                mainSubscription.add(
                    wrapperRef.instance.close.subscribe(() => {
                        resolve(void 0);
                        mainSubscription.unsubscribe();
                        overlayRef.dispose();
                    })
                );

                // Resolve on backdrop click
                mainSubscription.add(
                    overlayRef.backdropClick().subscribe(() => {
                        resolve(void 0);
                        mainSubscription.unsubscribe();
                        overlayRef.dispose();
                    })
                );

                // Escape key to close (optional but nice)
                mainSubscription.add(
                    overlayRef.keydownEvents().subscribe((ev) => {
                        if (ev.key === 'Escape') {
                            resolve(void 0);
                            mainSubscription.unsubscribe();
                            overlayRef.dispose();
                        }
                    })
                );
            }
        });
    }
}
