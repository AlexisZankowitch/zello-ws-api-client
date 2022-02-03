const WebSocket = require( "ws" );
const config = require( "./config.json" );

const wss = new WebSocket( config.wss );

const USERNAME = config.users.sender.username;
const PASSWORD = config.users.sender.password;
const CHANNELS = config.channels;

let shouldSendMessage = true;

async function sendText() {
    return new Promise( ( resolve, reject ) => {
        wss.send( JSON.stringify(
            {
                "command" : "send_text_message",
                "seq"     : 3,
                "channel" : config.channels[0],
                "text"    : "A text message has been sent"
            }
        ), ( err ) => {
            if ( err ) {
                console.log( "ERROR: ", err );
            }
            resolve();
            // wss.close();
        } );
    } );
}

wss.on( "open", () => {
    wss.send( JSON.stringify( {
        "command"  : "logon",
        "seq"      : 1,
        "username" : USERNAME,
        "password" : PASSWORD,
        "channels" : CHANNELS
    } ), ( err ) => {
        if ( err ) {
            console.log( "🚀 ~ err", err );
        }
    } );
} );

wss.on( "message", async ( data ) => {
    const json = JSON.parse( data );
    // console.log("🚀 ~ Received msg parsed into json: ", json)
    if ( shouldSendMessage ) {
        shouldSendMessage = false;
        await sendText();
        wss.close();
    }
} );