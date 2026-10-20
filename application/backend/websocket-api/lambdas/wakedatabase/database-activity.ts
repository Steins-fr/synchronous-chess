import { CloudWatchClient, GetMetricDataCommand, GetMetricDataCommandOutput, MetricDataResult } from '@aws-sdk/client-cloudwatch';
import { getDatabaseInstanceIdentifier } from '@helpers/environment.helper';

// The most capacity of each 5 minutes: 96 points over 8 hours, in one page of GetMetricData
const CAPACITY_PERIOD_SECONDS: number = 300;

const cloudWatch: CloudWatchClient = new CloudWatchClient({});

/**
 * Whether the database ran since the date: its writer instance had a capacity above 0 (ServerlessDatabaseCapacity of
 * CloudWatch), 0 while it pauses. Read from CloudWatch, which leaves a paused database asleep. Without any point, it did
 * not run: the database is woken, the safe side
 * @throws {CloudWatchServiceException} when CloudWatch refuses the read
 */
export async function wasAwakeSince(since: Date): Promise<boolean> {
    const { MetricDataResults }: GetMetricDataCommandOutput = await cloudWatch.send(new GetMetricDataCommand({
        StartTime: since,
        EndTime: new Date(),
        MetricDataQueries: [{
            Id: 'capacity',
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/RDS',
                    MetricName: 'ServerlessDatabaseCapacity',
                    Dimensions: [{ Name: 'DBInstanceIdentifier', Value: getDatabaseInstanceIdentifier() }],
                },
                Period: CAPACITY_PERIOD_SECONDS,
                Stat: 'Maximum',
            },
        }],
    }));

    return (MetricDataResults ?? []).some((result: MetricDataResult): boolean => (result.Values ?? []).some((capacity: number): boolean => capacity > 0));
}
