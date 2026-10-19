import { GetParameterCommand, GetParameterCommandOutput, SSMClient } from '@aws-sdk/client-ssm';
import { getAccessPublicKey, getAccessSigningKeyParameter } from '@helpers/environment.helper';
import { createPrivateKey, createPublicKey, KeyObject } from 'node:crypto';

/**
 * @throws {Error} when the environment does not give the parameter, SSM refuses to read it, it has no value, or its key
 * is not the one of the public key of CloudFront
 */
async function readAccessSigningKey(): Promise<KeyObject> {
    const name: string = getAccessSigningKeyParameter();
    const { Parameter }: GetParameterCommandOutput = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));

    if (!Parameter?.Value) {
        throw new Error(`No value in the SSM parameter ${ name }: the access cookies are signed with its private key`);
    }

    const signingKey: KeyObject = createPrivateKey(Parameter.Value);

    // A key rotated in SSM only, or in the GitHub variable only: CloudFront would refuse every cookie signed
    if (createPublicKey(signingKey).export({ type: 'spki', format: 'der' }).toString('base64') !== getAccessPublicKey()) {
        throw new Error(`The key of the SSM parameter ${ name } is not the one of ACCESS_PUBLIC_KEY: rotate both`);
    }

    return signingKey;
}

/**
 * The private key signing the access cookies, read once by the access lambda when it loads, as the key of the hashes of
 * the IPs (source.helper): neither the configuration of the lambda nor the Terraform state hold it, the owner of the stage
 * writes it to its SSM parameter. Without it, the lambda fails to load, and the login fails
 */
export const accessSigningKey: KeyObject = await readAccessSigningKey();
