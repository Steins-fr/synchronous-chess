import Exception from './exception';
import ExceptionTypeEnum from './exception-type.enum';

export enum DatabaseOperationEnum {
    GET = 'get',
    PUT = 'put',
    UPDATE = 'update',
    DELETE = 'delete',
    QUERY = 'query',
}

/** A failure of the database, with the operation it failed: its cause is the error of the database client */
export default class DatabaseException extends Exception {
    public type: string = ExceptionTypeEnum.DATABASE;

    public constructor(public readonly operation: DatabaseOperationEnum, message: string, options?: ErrorOptions) {
        super(message, options);
    }
}
