import { ResponsePayloadType } from 'src/handlers/message-handler';

// FIXME: data should be a generic type
export default interface ResponsePayload {
    id: number;
    /** @deprecated */
    type: ResponsePayloadType;
    data: object;
}
