#!/usr/bin/env bash
# The smoke test of the Data API, run with the AWS credentials of the shell (AWS_PROFILE...):
#   npm run smoke:data-api -- <stage>        npm run smoke:data-api -- staging
# Runs the statements of the repositories on the Aurora cluster of the stage (data-api-smoke.ts), waits for the
# cluster to pause, then times a statement sent to the paused cluster
set -euo pipefail

stage="${1:?Usage: npm run smoke:data-api -- <stage>}"
cluster="sc-database-$stage"
export AWS_REGION="${AWS_REGION:-eu-west-1}"

# The resource of the Data API, and the secret it reads the credentials in
read -r DATABASE_RESOURCE_ARN DATABASE_SECRET_ARN DATABASE_NAME <<< "$(aws rds describe-db-clusters \
    --db-cluster-identifier "$cluster" \
    --query 'DBClusters[0].[DBClusterArn, MasterUserSecret.SecretArn, DatabaseName]' \
    --output text)"
export DATABASE_RESOURCE_ARN DATABASE_SECRET_ARN DATABASE_NAME

npx tsx local/data-api-smoke.ts
# The pause is looked for from the minute after the statements: CloudWatch rounds the start down
statements_end="$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%SZ)"

# Its capacity drops to 0 ACU once paused, 5 minutes after the last request
echo "Waiting for the cluster to pause"
for minute in $(seq 1 15); do
    sleep 60
    capacity="$(aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS --metric-name ServerlessDatabaseCapacity \
        --dimensions Name=DBInstanceIdentifier,Value="$cluster-writer" \
        --start-time "$statements_end" \
        --end-time "$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%SZ)" \
        --period 60 --statistics Minimum \
        --query 'min(Datapoints[].Minimum)' --output text)"
    echo "Minute $minute: $capacity ACU at least"
    if [ "$capacity" = "0.0" ]; then
        echo "The cluster paused"
        npx tsx local/data-api-smoke.ts resume
        exit 0
    fi
done

echo "The cluster did not pause: see its instance.log" >&2
exit 1
