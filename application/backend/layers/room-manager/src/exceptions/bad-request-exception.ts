import Exception from './exception';
import ExceptionType from './exception.types';

export default class BadRequestException extends Exception {

    public type: string = ExceptionType.BAD_REQUEST;

    public constructor(message: string) {
        super(message);
    }
}
