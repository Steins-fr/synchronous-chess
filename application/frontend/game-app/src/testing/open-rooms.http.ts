import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OpenRoom } from '@protocol/responses/rooms-response';

/** The HTTP API of the specs (HTTP_API_SERVER) */
export const TEST_HTTP_API_SERVER: string = 'https://api.test';

/**
 * Answers the lists of the open rooms the setup forms of the page requested, with the rooms given: the resource of a
 * list keeps the page unstable (whenStable) until it is answered
 * @returns the requests answered
 */
export function answerOpenRooms(rooms: OpenRoom[] = []): TestRequest[] {
    TestBed.tick();
    const requests: TestRequest[] = TestBed.inject(HttpTestingController)
        .match((request: { url: string }) => request.url === `${ TEST_HTTP_API_SERVER }/rooms`);
    requests.forEach((request: TestRequest) => request.flush({ rooms, hasMore: false }));
    return requests;
}
