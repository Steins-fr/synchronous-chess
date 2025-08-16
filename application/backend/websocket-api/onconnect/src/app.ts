import { APIGatewayProxyEvent } from "aws-lambda";

interface Response {
    statusCode: number;
    body: string;
}

export const handler = async function (
    event: APIGatewayProxyEvent
): Promise<Response> {
    console.log(`New connection: ${event.requestContext.connectionId}`);

    return { statusCode: 200, body: "Connected" };
};
