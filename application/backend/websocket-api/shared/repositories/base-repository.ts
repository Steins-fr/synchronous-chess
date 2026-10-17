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
    GetCommandOutput,
    QueryCommand,
    QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import DatabaseException, { DatabaseOperationEnum } from '@exceptions/database-exception';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentAttributes = Record<string, any>;

/** How an index is read: the most items, and in which order of its sort key */
export interface IndexReading {
    maxItems: number;
    /** The last of the sort key first, the first otherwise */
    lastFirst: boolean;
}

/** A condition a write requires, or a queried item meets, with the values its expression compares to, and the names it uses */
export interface WriteCondition {
    expression: string;
    attributeValues?: DocumentAttributes;
    attributeNames?: Record<string, string>;
}

export default abstract class BaseRepository<Resource extends DocumentAttributes> {
    /**
     * The most pages a query of an index reads, `maxItems` then twice as many each: the items filtered out until the TTL
     * deletes them, within a few days, do not cost more reads
     */
    public static readonly MAX_INDEX_PAGES: number = 3;

    private readonly client = new DynamoDBClient();
    private readonly ddb = DynamoDBDocumentClient.from(this.client);
    protected readonly abstract tableName: string;
    protected readonly abstract defaultProjection: string;

    protected abstract getKey(item: Partial<Resource>): DocumentAttributes;

    /** Runs a command, its DynamoDB failure reported as a DatabaseException of the operation */
    private async run<Output>(operation: DatabaseOperationEnum, command: () => Promise<Output>): Promise<Output> {
        try {
            return await command();
        } catch (err) {
            if (err instanceof DynamoDBServiceException) {
                throw new DatabaseException(operation, err.message, { cause: err });
            }

            throw err;
        }
    }

    /** @returns false when the condition of the command does not hold: nothing written */
    private async runIf(operation: DatabaseOperationEnum, command: () => Promise<unknown>): Promise<boolean> {
        return this.run(operation, async (): Promise<boolean> => {
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
            ExpressionAttributeNames: condition?.attributeNames,
            ReturnValues: 'NONE',
        });
    }

    public async put(item: Resource): Promise<Resource> {
        await this.run(DatabaseOperationEnum.PUT, (): Promise<PutCommandOutput> => this.ddb.send(this.putCommand(item)));
        return item;
    }

    /** @returns false when the condition does not hold: nothing written */
    public async putIf(item: Resource, condition: WriteCondition): Promise<boolean> {
        return this.runIf(DatabaseOperationEnum.PUT, (): Promise<PutCommandOutput> => this.ddb.send(this.putCommand(item, condition)));
    }

    /** @param item its key at least */
    public async delete(item: Partial<Resource>): Promise<void> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
        });

        await this.run(DatabaseOperationEnum.DELETE, (): Promise<DeleteCommandOutput> => this.ddb.send(command));
    }

    public async find(item: Partial<Resource>): Promise<Resource | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            ProjectionExpression: this.defaultProjection,
        });

        const data = await this.run(DatabaseOperationEnum.GET, (): Promise<GetCommandOutput> => this.ddb.send(command));
        return (data.Item as Resource | undefined) ?? null;
    }

    /**
     * The items of a secondary index matching the key condition and the filter, in the order of its sort key, read page
     * after page until enough match. The filter drops the items a page read: the first page reads `maxItems` items, each
     * next one twice as many as the one before, MAX_INDEX_PAGES pages at most, so that many items filtered out cost a few
     * queries only. Past them, fewer items than `maxItems` may be returned, although more match
     * @param projection the attributes read: the ones the index holds
     * @returns the attributes of the projection only
     */
    public async queryIndex<Item extends DocumentAttributes>(
        indexName: string,
        keyCondition: WriteCondition,
        filter: WriteCondition,
        projection: string,
        { maxItems, lastFirst }: IndexReading,
    ): Promise<Item[]> {
        const items: Item[] = [];
        let startKey: DocumentAttributes | undefined;
        let pageSize: number = maxItems;
        let pages: number = 0;

        do {
            const command = new QueryCommand({
                TableName: this.tableName,
                IndexName: indexName,
                KeyConditionExpression: keyCondition.expression,
                FilterExpression: filter.expression,
                ProjectionExpression: projection,
                ExpressionAttributeValues: { ...keyCondition.attributeValues, ...filter.attributeValues },
                ExpressionAttributeNames: BaseRepository.attributeNames(keyCondition, filter),
                ScanIndexForward: !lastFirst,
                Limit: pageSize,
                ExclusiveStartKey: startKey,
            });
            // eslint-disable-next-line no-await-in-loop -- the pages, one after the other: each gives the start of the next
            const page = await this.run(DatabaseOperationEnum.QUERY, (): Promise<QueryCommandOutput> => this.ddb.send(command));
            items.push(...(page.Items ?? []) as Item[]);
            startKey = page.LastEvaluatedKey;
            pageSize *= 2;
            pages++;
        } while (startKey && items.length < maxItems && pages < BaseRepository.MAX_INDEX_PAGES);

        return items.slice(0, maxItems);
    }

    /** The names the conditions use, undefined without any: DynamoDB refuses an empty map */
    private static attributeNames(...conditions: WriteCondition[]): Record<string, string> | undefined {
        const names: Record<string, string> = Object.assign({}, ...conditions.map((condition: WriteCondition): Record<string, string> | undefined => condition.attributeNames));
        return Object.keys(names).length > 0 ? names : undefined;
    }

    /** @param attributeNames the names the expression uses: the attributes named by the players for instance */
    public async updateItem(
        item: Resource,
        expression: UpdateCommandInput['UpdateExpression'],
        attributeValues?: UpdateCommandInput['ExpressionAttributeValues'],
        attributeNames?: UpdateCommandInput['ExpressionAttributeNames'],
    ): Promise<Resource> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            UpdateExpression: expression,
            ExpressionAttributeValues: attributeValues,
            ExpressionAttributeNames: attributeNames,
            ReturnValues: 'ALL_NEW',
        });

        const data = await this.run(DatabaseOperationEnum.UPDATE, (): Promise<UpdateCommandOutput> => this.ddb.send(command));
        return data.Attributes as Resource;
    }

    /**
     * @param item its key at least
     * @returns false when the condition does not hold: nothing updated
     */
    public async updateItemIf(item: Partial<Resource>, expression: string, condition: WriteCondition, attributeValues?: DocumentAttributes): Promise<boolean> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: this.getKey(item),
            UpdateExpression: expression,
            ConditionExpression: condition.expression,
            ExpressionAttributeValues: { ...attributeValues, ...condition.attributeValues },
            ExpressionAttributeNames: condition.attributeNames,
            ReturnValues: 'NONE',
        });

        return this.runIf(DatabaseOperationEnum.UPDATE, (): Promise<UpdateCommandOutput> => this.ddb.send(command));
    }
}
