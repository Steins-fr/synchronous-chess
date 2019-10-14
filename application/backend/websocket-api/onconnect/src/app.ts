interface Response {
    statusCode: number;
    body: string;
}

export const handler: (event: any) => Promise<Response> = async function (event: any): Promise<Response> {

    console.log(`New connection: ${event.requestContext.connectionId}`);

    return { statusCode: 200, body: 'Connected' };
};
