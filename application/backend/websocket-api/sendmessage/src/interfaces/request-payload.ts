import { RequestPayloadType } from 'src/handlers/message-handler';

export default interface RequestPayload {
    id: number;
    type: RequestPayloadType;
    data: string;
}
