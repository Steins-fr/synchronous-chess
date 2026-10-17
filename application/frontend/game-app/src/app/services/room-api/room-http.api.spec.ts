import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import RoomsResponse from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HTTP_API_SERVER } from './http-api-server.token';
import { RoomHttpApi } from './room-http.api';

describe('RoomHttpApi', () => {
    const rooms: RoomsResponse = {
        rooms: [{ roomName: 'room', hostPlayer: 'alice', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true }],
        hasMore: false,
    };
    let api: RoomHttpApi;
    let httpTesting: HttpTestingController;

    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        TestBed.configureTestingModule({
            providers: [{ provide: HTTP_API_SERVER, useValue: 'https://api.test' }],
        });
        api = TestBed.inject(RoomHttpApi);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
    });

    test('getOpenRooms should list the most recent rooms of a game, without search', () => {
        // Given
        const received: RoomsResponse[] = [];

        // When
        api.getOpenRooms({ game: RoomGame.CHESS }).subscribe((response: RoomsResponse) => received.push(response));
        const request: TestRequest = httpTesting.expectOne('https://api.test/rooms?game=chess');
        request.flush(rooms);

        // Then
        expect(request.request.method).toEqual('GET');
        expect(request.request.timeout).toEqual(30_000);
        expect(received).toEqual([rooms]);
    });

    test('getOpenRooms should search the rooms by a part of their name, its plus sign not read as a space by the API', () => {
        // Given
        const received: RoomsResponse[] = [];

        // When
        api.getOpenRooms({ game: RoomGame.CHAT, search: 'a+b & c#' }).subscribe((response: RoomsResponse) => received.push(response));
        httpTesting.expectOne('https://api.test/rooms?game=chat&search=a%2Bb%20%26%20c%23').flush(rooms);

        // Then
        expect(received).toEqual([rooms]);
    });

    test('getOpenRooms should log, then emit, the failure of the request', () => {
        // Given
        let failure: unknown;

        // When
        api.getOpenRooms({ game: RoomGame.CHESS }).subscribe({ error: (error: unknown) => failure = error });
        httpTesting.expectOne('https://api.test/rooms?game=chess').flush({ message: 'Payload not valid' }, { status: 400, statusText: 'Bad Request' });

        // Then
        expect(failure).toBeInstanceOf(HttpErrorResponse);
        expect(failure).toMatchObject({ status: 400 });
        expect(console.error).toHaveBeenCalledExactlyOnceWith('The open rooms could not be listed', failure);
    });

    test('getOpenRooms should log, then emit, the failure of a request it cannot build', () => {
        // Given
        let failure: unknown;

        // When: a search holding a lone surrogate, which HttpParams cannot encode
        const response = api.getOpenRooms({ game: RoomGame.CHESS, search: '\uD800' });
        response.subscribe({ error: (error: unknown) => failure = error });

        // Then
        expect(failure).toBeInstanceOf(URIError);
        expect(console.error).toHaveBeenCalledExactlyOnceWith('The open rooms could not be listed', failure);
        httpTesting.expectNone(() => true);
    });
});
