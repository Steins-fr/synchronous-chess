import * as AWS from 'aws-sdk';
import { PutItemInputAttributeMap } from 'aws-sdk/clients/dynamodb';

type UpdatePutItemOutput = AWS.DynamoDB.UpdateItemOutput | AWS.DynamoDB.PutItemOutput;
export type TableKey = AWS.DynamoDB.Key;

export default abstract class BaseRepository<T, U> {

    protected readonly ddb: AWS.DynamoDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
    protected readonly abstract tableName: string;
    protected readonly abstract defaultProjection: string;

    protected abstract getKey(item: Partial<T>): TableKey;

    public create(item: T): Promise<AWS.DynamoDB.PutItemOutput> {
        return this.createOrUpdate(item);
    }

    private createOrUpdate(item: T): Promise<AWS.DynamoDB.PutItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.PutItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const document: PutItemInputAttributeMap = AWS.DynamoDB.Converter.marshall(item);

            const putParams: AWS.DynamoDB.PutItemInput = {
                TableName: this.tableName,
                Item: document
            };

            this.ddb.putItem(putParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    public update(item: T): Promise<AWS.DynamoDB.PutItemOutput> {
        return this.createOrUpdate(item);
    }


    public delete(item: T): Promise<AWS.DynamoDB.DeleteItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.DeleteItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const deleteParams: AWS.DynamoDB.DeleteItemInput = {
                TableName: this.tableName,
                Key: this.getKey(item)
            };

            this.ddb.deleteItem(deleteParams, this.genDeleteItemCallback(resolve, reject));
        });
    }

    public get(item: Partial<T>): Promise<T> {
        return new Promise((resolve: (value: T) => void, reject: (value: AWS.AWSError) => void): void => {
            const params: AWS.DynamoDB.GetItemInput = {
                TableName: this.tableName,
                Key: this.getKey(item),
                ProjectionExpression: this.defaultProjection
            };

            this.ddb.getItem(params, (err: AWS.AWSError, connectionData: AWS.DynamoDB.GetItemOutput) => {
                if (err) {
                    reject(err);
                    return;
                }

                const data: T = AWS.DynamoDB.Converter.unmarshall(connectionData.Item || {}) as T;

                resolve(data);
            });
        });
    }

    public query(keys: string, paramValues: AWS.DynamoDB.ExpressionAttributeValueMap, limit: number = 1): Promise<T> { // TODO: Room or Null
        return new Promise((resolve: (value: T) => void, reject: (value: AWS.AWSError) => void): void => {
            const params: AWS.DynamoDB.QueryInput = {
                TableName: this.tableName,
                KeyConditionExpression: keys,
                ExpressionAttributeValues: paramValues,
                ProjectionExpression: this.defaultProjection,
                Limit: limit
            };

            this.ddb.query(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.QueryOutput) => {
                if (err) {
                    reject(err);
                    return;
                }

                const document: AWS.DynamoDB.AttributeMap = (roomData.Count === 0 || roomData === undefined || roomData.Items === undefined ? {} : roomData.Items.shift()) || {};

                resolve(AWS.DynamoDB.Converter.unmarshall(document) as T);
            });
        });
    }

    protected genUpdatePutCallback(resolve: (value: UpdatePutItemOutput) => void,
        reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: UpdatePutItemOutput) => void {
        return (err: AWS.AWSError, output: UpdatePutItemOutput): void => {
            if (err) {
                reject(err);
                return;
            }
            resolve(output);
        };
    }

    protected genDeleteItemCallback(resolve: (value: AWS.DynamoDB.DeleteItemOutput) => void,
        reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: AWS.DynamoDB.DeleteItemOutput) => void {
        return (err: AWS.AWSError, output: AWS.DynamoDB.DeleteItemOutput): void => {
            if (err) {
                reject(err);
                return;
            }
            resolve(output);
        };
    }

    protected marshall(data: Partial<T>): U & AWS.DynamoDB.AttributeMap {
        return (AWS.DynamoDB.Converter.marshall(data) as any);
    }
}
