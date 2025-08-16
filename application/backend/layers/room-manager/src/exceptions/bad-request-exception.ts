import Exception from './exception';
import ExceptionTypeEnum from './exception-type.enum';

export default class BadRequestException extends Exception {
    public type: string = ExceptionTypeEnum.BAD_REQUEST;

    public constructor(message: string) {
        super(message);
    }
}
