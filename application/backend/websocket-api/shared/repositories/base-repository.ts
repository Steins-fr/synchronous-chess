import { DynamoDBClient, DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    QueryCommandInput,
    QueryCommand,
    UpdateCommand,
    UpdateCommandInput,
    PutCommand,
    DeleteCommand,
    GetCommand
} from '@aws-sdk/lib-dynamodb';
import DynamoException, { DynamoCrudActionEnum } from '@exceptions/dynamo-exception';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentAttributes = Record<string, any>;

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

    public async findOneBy(expression: QueryCommandInput['KeyConditionExpression'], paramValues: QueryCommandInput['ExpressionAttributeValues']): Promise<Resource | null> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: expression,
            ExpressionAttributeValues: paramValues,
            ProjectionExpression: this.defaultProjection,
            ConsistentRead: true,
            Limit: 1
        });

        try {
            const data = await this.ddb.send(command);

            if (data.Count === 0 || data.Items === undefined) {
                return null;
            } else {
                return data.Items.shift() as Resource;
            }
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
}
