import { GetParameterCommand, GetParameterCommandOutput, SSMClient } from '@aws-sdk/client-ssm';
import { getSourceHashSecret, getSourceHashSecretParameter } from '@helpers/environment.helper';
import { createHmac } from 'node:crypto';

/** @throws {Error} when the environment does not give the parameter, SSM refuses to read it, or it has no value */
async function readSourceHashSecret(): Promise<string> {
    const name: string = getSourceHashSecretParameter();
    const { Parameter }: GetParameterCommandOutput = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));

    if (!Parameter?.Value) {
        throw new Error(`No value in the SSM parameter ${ name }: the IPs of the clients are hashed with a secret key`);
    }

    return Parameter.Value;
}

/**
 * The key of the hashes, read once by the lambda importing this helper (sendmessage), when it loads: Lambda waits for it
 * in the cold start, before running the handler. Given by the local server and the specs, read from its SSM parameter on
 * AWS: neither the configuration of the lambda nor the Terraform state hold it. Without it, the lambda fails to load, and
 * the request starting it fails
 */
const sourceHashSecret: string = getSourceHashSecret() ?? await readSourceHashSecret();

/**
 * What the API keeps of the IP of a client: a short HMAC, enough to tell the clients apart, never the IP. Keyed by a
 * secret read when the lambda loads: the 2^32 IPv4 addresses are not hashed in turn to find the one of a hash without it
 */
export function hashSource(sourceIp: string): string {
    return createHmac('sha256', sourceHashSecret).update(sourceIp).digest('hex').slice(0, 16);
}
