import { ConditionalCheckFailedException, DynamoDBClient, DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    UpdateCommand,
    UpdateCommandInput,
    PutCommand,
    DeleteCommand,
    GetCommand
} from '@aws-sdk/lib-dynamodb';
import DynamoException, { DynamoCrudActionEnum } from '@exceptions/dynamo-exception';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentAttributes = Record<string, any>;

/** A condition a write requires, with the values its expression compares to */
export interface WriteCondition {
    expression: string;
    attributeValues?: DocumentAttributes;
}

export default abstract class BaseRepository<Resource extends DocumentAttributes> {

    private readonly client = new DynamoDBClient();
    private readonly ddb = DynamoDBDocumentClient.from(this.client);
    protected readonly abstract tableName: string;
    protected readonly abstract defaultProjection: string;

    protected abstract getKey(item: Partial<Resource>): DocumentAttributes;

    public async put(item: Resource): Promise<Resource> {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: item,
            ReturnValues: 'NONE',
        });

        try {
            await this.ddb.send(command);
            return item;
        } catch (err) {
            if (err instanceof DynamoDBServiceException) {
                throw new DynamoException(DynamoCrudActionEnum.PUT, err.message);
            }

            throw err;
        }
    }

    /** @returns false when the condition does not hold: nothing written */
    public async putIf(item: Resource, condition: WriteCondition): Promise<boolean> {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: condition.expression,
            ExpressionAttributeValues: condition.attributeValues,
            ReturnValues: 'NONE',
        });

        return this.sendConditionally(DynamoCrudActionEnum.PUT, (): Promise<unknown> => this.ddb.send(command));
    }

    public async delete(item: Resource): Promise<void> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
        });

        try {
            await this.ddb.send(command);
        } catch (err) {
            if (err instanceof DynamoDBServiceException) {
                throw new DynamoException(DynamoCrudActionEnum.DELETE, err.message);
            }

            throw err;
        }
    }

    public async find(item: Partial<Resource>): Promise<Resource | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            ProjectionExpression: this.defaultProjection,
        });

        try {
            const data = await this.ddb.send(command);

            if (!data.Item) {
                return null;
            }

            return data.Item as Resource;
        } catch (err) {
            if (err instanceof DynamoDBServiceException) {
                throw new DynamoException(DynamoCrudActionEnum.GET, err.message);
            }

            throw err;
        }
    }

    public async updateItem(item: Resource, expression: UpdateCommandInput['UpdateExpression'], attributeValues?: UpdateCommandInput['ExpressionAttributeValues']): Promise<Resource> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            UpdateExpression: expression,
            ExpressionAttributeValues: attributeValues,
            ReturnValues: 'ALL_NEW',
        });

        try {
            const data = await this.ddb.send(command);
            return data.Attributes as Resource;
        } catch (err) {
            if (err instanceof DynamoDBServiceException) {
                throw new DynamoException(DynamoCrudActionEnum.UPDATE, err.message);
            }

            throw err;
        }
    }

    /** @returns false when the condition does not hold: nothing updated */
    public async updateItemIf(item: Resource, expression: string, condition: WriteCondition, attributeValues?: DocumentAttributes): Promise<boolean> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            UpdateExpression: expression,
            ConditionExpression: condition.expression,
            ExpressionAttributeValues: { ...attributeValues, ...condition.attributeValues },
            ReturnValues: 'NONE',
        });

        return this.sendConditionally(DynamoCrudActionEnum.UPDATE, (): Promise<unknown> => this.ddb.send(command));
    }

    private async sendConditionally(action: DynamoCrudActionEnum, send: () => Promise<unknown>): Promise<boolean> {
        try {
            await send();
            return true;
        } catch (err) {
            if (err instanceof ConditionalCheckFailedException) {
                return false;
            }

            if (err instanceof DynamoDBServiceException) {
                throw new DynamoException(action, err.message);
            }

            throw err;
        }
    }
}
