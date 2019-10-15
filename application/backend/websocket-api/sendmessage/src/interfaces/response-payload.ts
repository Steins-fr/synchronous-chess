import { ResponsePayloadType } from 'src/handlers/message-handler';

export default interface ResponsePayload {
    type: ResponsePayloadType;
    data: string;
}
