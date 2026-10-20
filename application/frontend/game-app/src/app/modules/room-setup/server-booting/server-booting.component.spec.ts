import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ServerBootingComponent } from './server-booting.component';

describe('ServerBootingComponent', () => {
    let fixture: ComponentFixture<ServerBootingComponent>;

    async function wait(waiting: boolean, time: number = 0): Promise<void> {
        fixture.componentRef.setInput('waiting', waiting);
        TestBed.tick();
        await vi.advanceTimersByTimeAsync(time);
        TestBed.tick();
    }

    // The status read by the screen readers, always in the page
    function status(): HTMLOutputElement {
        return fixture.nativeElement.querySelector('output');
    }

    function text(): string {
        return status().textContent.trim();
    }

    beforeEach(() => {
        vi.useFakeTimers();
        fixture = TestBed.createComponent(ServerBootingComponent);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should tell nothing of a quick request', async () => {
        // When
        await wait(true, ServerBootingComponent.DELAY - 1);

        // Then: the status in the page already, for its text to be read once it changes
        expect(status()).not.toBeNull();
        expect(text()).toBe('');

        // When
        await wait(false, 1);

        // Then
        expect(text()).toBe('');
    });

    test('should tell the server boots once a request waits long, until answered', async () => {
        // When
        await wait(true, ServerBootingComponent.DELAY);

        // Then: told in the status already in the page
        expect(text()).toBe(
            'Starting the server…The server and its database sleep when nobody plays: waking them up takes up to about thirty seconds.',
        );

        // When
        await wait(false);

        // Then
        expect(text()).toBe('');
    });
});
