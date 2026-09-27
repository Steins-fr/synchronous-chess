import { vi } from 'vitest';

/**
 * Replacement of the global WebSocket: the connection lifecycle is driven by the test
 */
export class WebSocketMock {
    public static readonly CONNECTING: number = 0;
    public static readonly OPEN: number = 1;
    public static readonly CLOSING: number = 2;
    public static readonly CLOSED: number = 3;
    public static instances: WebSocketMock[] = [];

    public readyState: number = WebSocketMock.CONNECTING;
    public onopen?: () => void;
    public onclose?: () => void;
    public onmessage?: (event: { data: string }) => void;
    public readonly send = vi.fn();
    public readonly close = vi.fn();

    public constructor(public readonly url: string) {
        WebSocketMock.instances.push(this);
    }

    public static last(): WebSocketMock {
        return WebSocketMock.instances[WebSocketMock.instances.length - 1];
    }

    public open(): void {
        this.readyState = WebSocketMock.OPEN;
        this.onopen?.();
    }

    public closeFromServer(): void {
        this.readyState = WebSocketMock.CLOSED;
        this.onclose?.();
    }

    public receive(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) });
    }

    public sentPackets(): unknown[] {
        return this.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string));
    }
}
