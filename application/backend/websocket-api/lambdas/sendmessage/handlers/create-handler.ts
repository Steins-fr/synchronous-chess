import BadRequestException from '@exceptions/bad-request-exception';
import { isPassword } from '@helpers/password.helper';
import { MAX_ROOM_TAG, randomRoomTag, tagRoomName } from '@helpers/room-tag.helper';
import { isName } from '@helpers/text.helper';
import { isToken } from '@helpers/token.helper';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { PLAYER_NAME_MAX_LENGTH, ROOM_MAX_PLAYERS, ROOM_NAME_MAX_LENGTH, ROOM_TAG_SEPARATOR } from '@protocol/room-limits';
import { isRoomGame } from '@protocol/room-game.enum';
import { RoomApiRequestTypeEnum, RoomApiResponseTypeEnum } from '@protocol/socket-packet-payload.type';
import MessageHandler from './message-handler';

export default class CreateHandler extends MessageHandler {
    /** The tags drawn at random for a room, each taken by another room of its name, before the tags following the highest */
    private static readonly RANDOM_TAG_ATTEMPTS: number = 5;
    /** The tags following the highest one of the name tried, each taken meanwhile by another room created under it */
    private static readonly NEXT_TAG_ATTEMPTS: number = 5;

    protected override async handle(): Promise<void> {
        const data = this.getPayloadData(RoomApiRequestTypeEnum.CREATE);

        if (!isName(data.roomName, ROOM_NAME_MAX_LENGTH) || data.roomName.includes(ROOM_TAG_SEPARATOR) || !CreateHandler.isMaxPlayer(data.maxPlayer)
            || !isName(data.playerName, PLAYER_NAME_MAX_LENGTH) || !isToken(data.token) || !isRoomGame(data.game)
            || (data.password !== undefined && !isPassword(data.password))) {
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }

        await this.roomService.notHostingGuard(await this.connectionService.get(this.connectionId));
        const roomId: string = await this.createTagged(data);

        await this.reply(RoomApiResponseTypeEnum.CREATED, {
            roomName: roomId,
            playerName: data.playerName,
            maxPlayer: data.maxPlayer,
        });
    }

    /**
     * Creates the room under its name and a tag no room holds: drawn at random, then, the tags drawn all taken, the tag
     * following the highest one of the name
     * @returns the id of the room created
     * @throws {BadRequestException} when no tag is left for the name
     */
    private async createTagged(data: RoomCreateRequest): Promise<string> {
        const name: string = data.roomName.trim();

        for (let attempt: number = 0; attempt < CreateHandler.RANDOM_TAG_ATTEMPTS; attempt++) {
            const roomId: string = tagRoomName(name, randomRoomTag());
            // eslint-disable-next-line no-await-in-loop -- the next tag drawn once this one is taken only
            if (await this.createRoom(data, roomId)) {
                return roomId;
            }
        }

        for (let attempt: number = 0; attempt < CreateHandler.NEXT_TAG_ATTEMPTS; attempt++) {
            // eslint-disable-next-line no-await-in-loop -- read again once another room took the tag read
            const tag: number = await this.roomService.nextRoomTag(name);

            if (tag > MAX_ROOM_TAG) {
                break;
            }

            const roomId: string = tagRoomName(name, tag);
            // eslint-disable-next-line no-await-in-loop -- the next tag read once this one is taken only
            if (await this.createRoom(data, roomId)) {
                return roomId;
            }
        }

        throw new BadRequestException('No tag left for the room name');
    }

    /** @returns false when a room holds the id: nothing created */
    private async createRoom(data: RoomCreateRequest, roomId: string): Promise<boolean> {
        // Before the room: a connection whose room was not created leaves no room on $disconnect, a room without its
        // host connection would never wait for it
        await this.createConnection(roomId);
        return this.roomService.create(data, roomId, this.connectionId);
    }

    /** Listed to every player of the game: a whole number of players, from the host alone to ROOM_MAX_PLAYERS */
    private static isMaxPlayer(value: unknown): value is number {
        return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ROOM_MAX_PLAYERS;
    }
}
