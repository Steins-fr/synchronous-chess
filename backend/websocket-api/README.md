# synchronous-chess-websockets-app

## Deploying to your account - AWS CLI commands

Install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html) and use it to package, deploy, and describe the application. These are the commands you'll need to use:

```
yarn package
yarn deploy
yarn describe
```

## Testing the chat API

To test the WebSocket API, use [wscat](https://github.com/websockets/wscat), an open-source command line tool.

Install wscat:
``` bash
$ npm install -g wscat
```

Run test:
```bash
yarn ws
```
connected (press CTRL+C to quit)
```
> {"message":"sendmessage", "data":"hello world"}
< hello world
```
