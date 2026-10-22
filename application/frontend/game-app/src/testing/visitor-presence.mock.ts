import { Signal, signal } from '@angular/core';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';

/**
 * The presence of a person on the page, given by the spec: by default the person the specs are, acting on the pages, which
 * reach the APIs at once (test-providers.ts). jsdom has neither the activation nor the navigation entries the service reads,
 * and trusts no event a spec dispatches: notice() is the gesture of a person the service sees
 */
export class VisitorPresenceMock implements Pick<VisitorPresenceService, 'present'> {
    private readonly isPresent = signal<boolean>(this.initiallyPresent);

    public readonly present: Signal<boolean> = this.isPresent.asReadonly();

    public constructor(private readonly initiallyPresent: boolean = true) {}

    public notice(): void {
        this.isPresent.set(true);
    }
}
