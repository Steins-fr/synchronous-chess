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
    templateUrl: './dialog-wrapper.component.html',
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
        Object.entries(this.childInputs()).forEach(([key, value]) => {
            bindings.push(inputBinding(key, signal(value)));
        });

        const componentRef = vcr.createComponent<TChild>(this.childComponent(), {
            environmentInjector: this.environmentInjector,
            bindings,
        });

        // Apply inputs

        // Propagate child result output if it exists
        const childResult: unknown = (componentRef.instance as { result?: unknown }).result;
        if (childResult instanceof EventEmitter || childResult instanceof OutputEmitterRef) {
            const sub = (childResult as OutputEmitterRef<TResult>).subscribe((value: TResult) =>
                this.result.emit(value)
            );
            componentRef.onDestroy(() => sub.unsubscribe());
        }
    }
}
