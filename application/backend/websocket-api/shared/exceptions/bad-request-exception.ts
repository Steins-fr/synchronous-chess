import Exception from './exception';
import ExceptionTypeEnum from './exception-type.enum';

export default class BadRequestException extends Exception {
    public type: string = ExceptionTypeEnum.BAD_REQUEST;

    public constructor(message: string) {
        super(message);
    }
}

/** Whether an error is a refused request, by its type: its message is told to the client */
export function isBadRequestException(e: unknown): e is BadRequestException {
    return !!e && typeof e === 'object' && 'type' in e && e.type === ExceptionTypeEnum.BAD_REQUEST;
}
