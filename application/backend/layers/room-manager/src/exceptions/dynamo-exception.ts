import Exception from './exception';
import ExceptionType from './exception.types';

export enum DynamoCrudAction {
    GET = 'get',
    PUT = 'put',
    UPDATE = 'update',
    DELETE = 'delete'
}

export default class DynamoException extends Exception {

    public type: string = ExceptionType.DYNAMO_DB;

    public constructor(public readonly action: DynamoCrudAction, message: string) {
        super(message);
    }
}
