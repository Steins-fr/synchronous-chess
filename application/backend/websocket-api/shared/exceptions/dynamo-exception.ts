import Exception from './exception';
import ExceptionTypeEnum from './exception-type.enum';

export enum DynamoCrudActionEnum {
    GET = 'get',
    PUT = 'put',
    UPDATE = 'update',
    DELETE = 'delete'
}

export default class DynamoException extends Exception {
    public type: string = ExceptionTypeEnum.DYNAMO_DB;

    public constructor(public readonly action: DynamoCrudActionEnum, message: string) {
        super(message);
    }
}
