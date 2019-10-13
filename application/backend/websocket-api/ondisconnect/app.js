exports.handler = async function (event) {

    console.log(`Exit connection: ${event.requestContext.connectionId}`);

    return { statusCode: 200, body: 'Exited' };
};