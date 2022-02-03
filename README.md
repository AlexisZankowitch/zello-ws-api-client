# zello-ws-api-client

Project to test zello ws api

## Prerequisite 
1. Install dependencies: `npm i`
1. Create a `config.json` file in your root directory#:
    ```
    touch config.json
    ```
    Copy and fill the following with your own credentials

    ```json
    {
      "wss": "YOU_WSS_URL",
      "channels": "ARRAY_OF_CHANNELS",
      "users": {
        "sender": {
          "username": "USERNAME",
          "password": "PASSWORD"
        },
        "listener": {
          "username": "USERNAME",
          "password": "PASSWORD"
        }
      }
    }
    ```

    _NOTE:_ You should have 2 users set up on your ZES. One to send another for the listener

## How to use
Once you have set up the `config.json` file you can run:

### `npm run listener`
It will connect to your the ZES server configured in `config.json.wss` using the listener credentials. 

### `npm run send_audio`
It will send the `media.opus` file through the websocket connection. 

### `npm run send_text_message`
It will send the a text message through the websocket connection. 

### `npm run lint`
Fix all fixable linting issues