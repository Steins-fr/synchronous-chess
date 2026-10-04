import { ConditionalCheckFailedException, DynamoDBClient, DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    UpdateCommand,
    UpdateCommandInput,
    UpdateCommandOutput,
    PutCommand,
    PutCommandOutput,
    DeleteCommand,
    DeleteCommandOutput,
    GetCommand,
    GetCommandOutput
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

    /** Runs a command, its DynamoDB failure reported as a DynamoException of the action */
    private async run<Output>(action: DynamoCrudActionEnum, command: () => Promise<Output>): Promise<Output> {
        try {
            return await command();
        } catch (err) {
            if (err instanceof DynamoDBServiceException) {
                throw new DynamoException(action, err.message);
            }

            throw err;
        }
    }

    /** @returns false when the condition of the command does not hold: nothing written */
    private async runIf(action: DynamoCrudActionEnum, command: () => Promise<unknown>): Promise<boolean> {
        return this.run(action, async (): Promise<boolean> => {
            try {
                await command();
                return true;
            } catch (err) {
                if (err instanceof ConditionalCheckFailedException) {
                    return false;
                }

                throw err;
            }
        });
    }

    private putCommand(item: Resource, condition?: WriteCondition): PutCommand {
        return new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: condition?.expression,
            ExpressionAttributeValues: condition?.attributeValues,
            ReturnValues: 'NONE',
        });
    }

    public async put(item: Resource): Promise<Resource> {
        await this.run(DynamoCrudActionEnum.PUT, (): Promise<PutCommandOutput> => this.ddb.send(this.putCommand(item)));
        return item;
    }

    /** @returns false when the condition does not hold: nothing written */
    public async putIf(item: Resource, condition: WriteCondition): Promise<boolean> {
        return this.runIf(DynamoCrudActionEnum.PUT, (): Promise<PutCommandOutput> => this.ddb.send(this.putCommand(item, condition)));
    }

    public async delete(item: Resource): Promise<void> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
        });

        await this.run(DynamoCrudActionEnum.DELETE, (): Promise<DeleteCommandOutput> => this.ddb.send(command));
    }

    public async find(item: Partial<Resource>): Promise<Resource | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            ProjectionExpression: this.defaultProjection,
        });

        const data = await this.run(DynamoCrudActionEnum.GET, (): Promise<GetCommandOutput> => this.ddb.send(command));
        return (data.Item as Resource | undefined) ?? null;
    }

    public async updateItem(item: Resource, expression: UpdateCommandInput['UpdateExpression'], attributeValues?: UpdateCommandInput['ExpressionAttributeValues']): Promise<Resource> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            UpdateExpression: expression,
            ExpressionAttributeValues: attributeValues,
            ReturnValues: 'ALL_NEW',
        });

        const data = await this.run(DynamoCrudActionEnum.UPDATE, (): Promise<UpdateCommandOutput> => this.ddb.send(command));
        return data.Attributes as Resource;
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

        return this.runIf(DynamoCrudActionEnum.UPDATE, (): Promise<UpdateCommandOutput> => this.ddb.send(command));
    }
}
