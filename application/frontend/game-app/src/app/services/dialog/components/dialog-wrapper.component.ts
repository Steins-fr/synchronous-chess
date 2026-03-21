import {
    Binding,
    Component,
    EnvironmentInjector,
    EventEmitter,
    inject,
    input,
    inputBinding,
    OnInit,
    output,
    OutputEmitterRef,
    signal,
    Type,
    viewChild,
    ViewContainerRef
} from '@angular/core';

@Component({
    selector: 'app-dialog-wrapper',
    template: `
<div
    class="rounded-md bg-white shadow-md flex flex-col gap-2 p-2 isolate min-w-[300px] max-w-[80vw] relative"
>
    @if (title()) {
    <h1 class="px-4 mx-auto text-2xl lg:text-3xl">{{ title() }}</h1>
    }
    @if (closable()) {
    <!-- <app-icon-button
        (click)="close.emit()"
        size="xs"
        iconName="close"
        class="absolute top-1 right-1 text-neutral-400"
        /> -->
    }

    <ng-container #container></ng-container>
</div>`,
    standalone: true,
    imports: [
        // IconButtonComponent
    ],
})
export class DialogWrapperComponent<TChild, TResult = void> implements OnInit {
    container = viewChild.required<ViewContainerRef>('container', {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
        read: ViewContainerRef,
    });

    /** Inputs signal */
    childComponent = input.required<Type<TChild>>(); // Component to instantiate
    childInputs = input<Partial<TChild>>({}); // Inputs to pass

    /** Dialog design options */
    public readonly closable = input<boolean>(true);
    public readonly title = input<string | undefined>(undefined);

    /** Output signal */
    result = output<TResult>();
    // eslint-disable-next-line @angular-eslint/no-output-native
    close = output<void>();

    private readonly environmentInjector = inject(EnvironmentInjector);

    public ngOnInit() {
        const vcr = this.container();

        const bindings: Binding[] = [];
        Object.entries(this.childInputs() || {}).forEach(([key, value]) => {
            bindings.push(inputBinding(key, signal(value)));
        });

        const componentRef = vcr.createComponent<TChild>(this.childComponent(), {
            environmentInjector: this.environmentInjector,
            bindings,
        });

        // Apply inputs

        // Propagate child result output if it exists
        const maybeChild: any = componentRef.instance;
        if (maybeChild?.result && (maybeChild?.result instanceof EventEmitter || maybeChild?.result instanceof OutputEmitterRef)) {
            const sub = maybeChild.result.subscribe((value: TResult) =>
                this.result.emit(value)
            );
            componentRef.onDestroy(() => sub.unsubscribe());
        }
    }
}
