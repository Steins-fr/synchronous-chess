import BadRequestException from '@exceptions/bad-request-exception';
import { isText } from '@helpers/text.helper';
import RoomsResponse from '@protocol/responses/rooms-response';
import { isRoomGame } from '@protocol/room-game.enum';
import { ROOM_SEARCH_MAX_LENGTH } from '@protocol/room-limits';
import RoomService from '@services/room-service';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

const ERROR_PARSING: string = 'Payload not valid';

const roomService: RoomService = new RoomService();

/** No search, or a text of a reasonable length: an empty one lists the most recent rooms */
function isSearch(value: string | undefined): boolean {
    return value === undefined || isText(value, ROOM_SEARCH_MAX_LENGTH, 0);
}

/**
 * Lists the rooms of a game, searched by name, to anyone: its query string is a RoomsRequest. Read from the raw query
 * string, decoded like the browsers encode it (URLSearchParams): API Gateway joins the values of a parameter given more
 * than once with commas, so such a parameter is refused rather than one of its values picked. The other parameters are
 * ignored
 * @throws {BadRequestException} when the game is unknown, or the search is not a text of a reasonable length
 */
export async function getRoomsHandler(event: APIGatewayProxyEventV2): Promise<RoomsResponse> {
    const query: URLSearchParams = new URLSearchParams(event.rawQueryString);
    const games: string[] = query.getAll('game');
    const searches: string[] = query.getAll('search');
    const game: string | undefined = games.at(0);
    const search: string | undefined = searches.at(0);

    if (games.length > 1 || searches.length > 1 || !isRoomGame(game) || !isSearch(search)) {
        throw new BadRequestException(ERROR_PARSING);
    }

    return roomService.getOpenRooms(game, search);
}
