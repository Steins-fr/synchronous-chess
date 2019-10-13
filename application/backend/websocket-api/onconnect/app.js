exports.handler = async function (event) {

    console.log(`New connection: ${event.requestContext.connectionId}`);

    return { statusCode: 200, body: 'Connected' };
};
