import { RequestPayloadType } from 'src/handlers/message-handler';

export default interface RequestPayload {
    type: RequestPayloadType;
    data: string;
}
