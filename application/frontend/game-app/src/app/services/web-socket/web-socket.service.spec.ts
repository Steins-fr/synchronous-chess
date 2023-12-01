import { TestBed } from '@angular/core/testing';

import { WebSocketService, SocketState, SocketPayload } from './web-socket.service';

describe('WebsocketService', () => {
    let socketSpy: jasmine.SpyObj<WebSocket>;
    let service: WebSocketService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [WebSocketService]
        });

        socketSpy = jasmine.createSpyObj<WebSocket>('WebSocket', ['readyState', 'onmessage', 'onopen', 'onclose', 'close', 'send']);
        service = TestBed.inject(WebSocketService);

        Object.defineProperty(service, 'webSocket', {
            value: socketSpy,
            writable: true
        });
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should throw Error on send() call if socket is not setup', () => {
        // Given
        Object.defineProperty(service, 'webSocket', {
            value: undefined,
            writable: false
        });
        // When
        const functionThrowError: () => void = (): void => service.send('', '');
        // Then
        expect(functionThrowError).toThrow(new Error(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP));
    });

    it('should not throw Error on send() call if socket is setup', () => {
        // Given
        Object.defineProperty(service, 'webSocket', {
            value: undefined,
            writable: false
        });

        Object.defineProperty(service, 'serverUrl', {
            value: 'url',
            writable: true
        });

        // When
        const functionThrowError: () => void = (): void => service.send('', '');
        // Then
        expect(functionThrowError).not.toThrow(new Error(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP));
    });

    it('should setup serverUrl on setup() call', () => {
        // Given
        expect(service.serverUrl).not.toEqual('url');
        // When
        service.setup('url');
        // Then
        expect(service.serverUrl).toEqual('url');
    });

    it('should close the socket on close() call when socket is open', () => {
        // Given
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.OPEN,
            writable: false
        });
        service.setup('url');
        // When
        service.close();
        // Then
        expect(socketSpy.close.calls.count()).toBe(1, '1 call');
    });

    it('should not close a socket already closed on close() call', () => {
        // Given
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.CLOSED,
            writable: false
        });
        // When
        service.close();
        // Then
        expect(socketSpy.close.calls.count()).toBe(0, '0 call');
    });

    it('should update the state observable on state changes', (done: DoneFn) => {
        // Given
        service.setup('url');
        Object.defineProperty(service, 'createSocket', {
            value: jasmine.createSpy('createSocket').and.returnValue(socketSpy),
            writable: false
        });
        service.connect();
        const states: Array<SocketState> = [SocketState.CONNECTING, SocketState.OPEN, SocketState.CLOSED];

        service.state.subscribe((state: SocketState) => {
            // Then
            const expectedState = states.shift();

            if (expectedState === undefined) {
                throw new Error('expectedState is undefined');
            }

            expect(state).toBe(expectedState);
            if (states.length === 0) {
                done();
            }
        });
        // When
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.OPEN,
            writable: false
        });

        expect(service.socket.onopen).toBeDefined();
        expect(service.socket.onclose).toBeDefined();

        if (!service.socket.onopen) {
            throw new Error('onopen is undefined');
        }

        if (!service.socket.onclose) {
            throw new Error('onclose is undefined');
        }

        service.socket.onopen(new Event(''));
        const stateEvent1: SocketState = service.stateValue;
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.CLOSED,
            writable: false
        });
        service.socket.onclose(new CloseEvent(''));
        const stateEvent2: SocketState = service.stateValue;
        // Then
        expect(stateEvent1).toBe(SocketState.OPEN);
        expect(stateEvent2).toBe(SocketState.CLOSED);
    });

    it('should update the message observable on received message', (done: DoneFn) => {
        // Given
        service.setup('url');
        Object.defineProperty(service, 'createSocket', {
            value: jasmine.createSpy('createSocket').and.returnValue(socketSpy),
            writable: false
        });
        service.connect();
        const payload1: SocketPayload = { type: 'message', data: 'data1' };
        const payload2: SocketPayload = { type: 'message', data: 'data2' };
        const payloads: Array<SocketPayload> = [payload1, payload2];

        service.message.subscribe((payload: SocketPayload) => {
            // Then
            const expectedPayload = payloads.shift();

            if (expectedPayload === undefined) {
                throw new Error('expectedState is undefined');
            }

            expect(payload).toEqual(expectedPayload);
            if (payloads.length === 0) {
                done();
            }
        });

        expect(service.socket.onmessage).toBeDefined();

        if (!service.socket.onmessage) {
            throw new Error('onmessage is undefined');
        }

        // When
        service.socket.onmessage(new MessageEvent('', { data: JSON.stringify(payload1) }));
        service.socket.onmessage(new MessageEvent('', { data: JSON.stringify(payload2) }));
    });
});
