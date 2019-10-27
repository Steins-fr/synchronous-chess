import { ResponsePayloadType } from 'src/handlers/message-handler';

export default interface ResponsePayload {
    id: number;
    type: ResponsePayloadType;
    data: string;
}
