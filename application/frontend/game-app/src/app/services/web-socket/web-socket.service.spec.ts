import { TestBed } from '@angular/core/testing';

import { WebSocketService, SocketState, SocketPayload } from './web-socket.service';

describe('WebsocketService', () => {
    let socketSpy: jasmine.SpyObj<WebSocket>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [WebSocketService]
        });

        socketSpy = jasmine.createSpyObj<WebSocket>('WebSocket', ['readyState', 'onmessage', 'onopen', 'onclose', 'close', 'send']);
    });

    it('should be created', () => {
        const service: WebSocketService = TestBed.get(WebSocketService);
        expect(service).toBeTruthy();
    });

    it('should throw Error on close() call if socket is undefined', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        // When
        const functionThrowError: () => void = (): void => service.close();
        // Then
        expect(service.socket).toBeUndefined();
        expect(functionThrowError).toThrow(new Error(WebSocketService.ERROR_MESSAGE_SOCKET_DOES_NOT_EXIST));
    });

    it('should throw Error on send() call if socket is undefined', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        // When
        const functionThrowError: () => void = (): boolean => service.send('', '', '');
        // Then
        expect(service.socket).toBeUndefined();
        expect(functionThrowError).toThrow(new Error(WebSocketService.ERROR_MESSAGE_SOCKET_DOES_NOT_EXIST));
    });

    it('should define socket on connect() call', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        expect(service.socket).toBeUndefined();
        // When
        service.connect(socketSpy);
        // Then
        expect(service.socket).toBeDefined();
    });

    it('should close the socket on close() call when socket is open', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.OPEN,
            writable: false
        });
        service.connect(socketSpy);
        // When
        service.close();
        // Then
        expect(socketSpy.close.calls.count()).toBe(1, '1 call');
    });

    it('should not close a socket already closed on close() call', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.CLOSED,
            writable: false
        });
        service.connect(socketSpy);
        // When
        service.close();
        // Then
        expect(socketSpy.close.calls.count()).toBe(0, '0 call');
    });

    it('should close older socket on new connect() call', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        service.connect(socketSpy);
        const otherSocketSpy: jasmine.SpyObj<WebSocket> = jasmine.createSpyObj('WebSocket', ['close']);
        // When
        service.connect(otherSocketSpy);
        // Then
        expect(service.socket).not.toBe(socketSpy);
        expect(socketSpy.close.calls.count()).toBe(1, '1 call');
    });

    it('should update the state observable on state changes', (done: DoneFn) => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        service.connect(socketSpy);
        const states: Array<SocketState> = [SocketState.CONNECTING, SocketState.OPEN, SocketState.CLOSED];

        service.state.subscribe((state: SocketState) => {
            // Then
            expect(state).toBe(states.shift());
            if (states.length === 0) {
                done();
            }
        });
        // When
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.OPEN,
            writable: false
        });
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
        const service: WebSocketService = TestBed.get(WebSocketService);
        service.connect(socketSpy);
        const payload1: SocketPayload = { type: 'message', data: 'data1' };
        const payload2: SocketPayload = { type: 'message', data: 'data2' };
        const payloads: Array<SocketPayload> = [payload1, payload2];

        service.message.subscribe((payload: SocketPayload) => {
            // Then
            expect(payload).toEqual(payloads.shift());
            if (payloads.length === 0) {
                done();
            }
        });
        // When
        service.socket.onmessage(new MessageEvent('', { data: JSON.stringify(payload1) }));
        service.socket.onmessage(new MessageEvent('', { data: JSON.stringify(payload2) }));
    });

    it('should send message on send() call with opened socket', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.OPEN,
            writable: false
        });
        const message: string = 'sendmessage';
        const type: string = 'join';
        const data: string = 'message1';
        service.connect(socketSpy);
        // When
        const result: boolean = service.send(message, type, data);
        // Then
        expect(socketSpy.send.calls.count()).toBe(1, '1 call');
        expect(socketSpy.send.calls.first().args.shift()).toEqual(JSON.stringify({ message, data: JSON.stringify({ type, data }) }));
        expect(result).toBeTruthy();
    });

    it('should not send message on send() call with closed socket', () => {
        // Given
        const service: WebSocketService = TestBed.get(WebSocketService);
        Object.defineProperty(socketSpy, 'readyState', {
            value: SocketState.CLOSED,
            writable: false
        });
        const message: string = 'sendmessage';
        const type: string = 'join';
        const data: string = 'message1';
        service.connect(socketSpy);
        // When
        const result: boolean = service.send(message, type, data);
        // Then
        expect(socketSpy.send.calls.count()).toBe(0, '0 call');
        expect(result).toBeFalsy();
    });
});
