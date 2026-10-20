import { CloudWatchClient, GetMetricDataCommand, GetMetricDataCommandOutput, InvalidParameterValueException } from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { wasAwakeSince } from './database-activity';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const SINCE = new Date('2026-10-20T04:00:00.000Z');

describe('database activity', () => {
    const cloudWatch = mockClient(CloudWatchClient);

    beforeEach(() => {
        cloudWatch.reset();
        vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
        vi.stubEnv('DATABASE_INSTANCE_IDENTIFIER', 'sc-database-test-writer');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should read the most capacity of the writer instance by 5 minutes, from the date until now', async () => {
        // Given
        cloudWatch.on(GetMetricDataCommand).resolves({ MetricDataResults: [{ Id: 'capacity', Values: [0] }] });

        // When
        await wasAwakeSince(SINCE);

        // Then
        expect(cloudWatch.commandCalls(GetMetricDataCommand)[0]?.args[0].input).toEqual({
            StartTime: SINCE,
            EndTime: NOW,
            MetricDataQueries: [{
                Id: 'capacity',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/RDS',
                        MetricName: 'ServerlessDatabaseCapacity',
                        Dimensions: [{ Name: 'DBInstanceIdentifier', Value: 'sc-database-test-writer' }],
                    },
                    Period: 300,
                    Stat: 'Maximum',
                },
            }],
        });
    });

    test('should tell the database ran when its capacity rose above 0', async () => {
        // Given: paused, then running a few minutes
        cloudWatch.on(GetMetricDataCommand).resolves({ MetricDataResults: [{ Id: 'capacity', Values: [0, 0.5, 0.5, 0] }] });

        // When / Then
        expect(await wasAwakeSince(SINCE)).toBe(true);
    });

    test.each<[string, GetMetricDataCommandOutput]>([
        ['paused all along', { $metadata: {}, MetricDataResults: [{ Id: 'capacity', Values: [0, 0, 0] }] }],
        ['without any point', { $metadata: {}, MetricDataResults: [{ Id: 'capacity', Values: [] }] }],
        ['without values', { $metadata: {}, MetricDataResults: [{ Id: 'capacity' }] }],
        ['without results', { $metadata: {} }],
    ])('should tell the database did not run when %s', async (_case: string, output: GetMetricDataCommandOutput) => {
        // Given
        cloudWatch.on(GetMetricDataCommand).resolves(output);

        // When / Then
        expect(await wasAwakeSince(SINCE)).toBe(false);
    });

    test('should fail when CloudWatch refuses the read', async () => {
        // Given
        const failure = new InvalidParameterValueException({ $metadata: {}, message: 'The start time is after the end time' });
        cloudWatch.on(GetMetricDataCommand).rejects(failure);

        // When / Then
        await expect(wasAwakeSince(SINCE)).rejects.toBe(failure);
    });
});
