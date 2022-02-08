const WebSocket = require( "ws" );
const config = require( "./config-zwork.json" );

const wss = new WebSocket( config.wss );

const USERNAME = config.users.listener.username;
const PASSWORD = config.users.listener.password;
const CHANNELS = config.channels;

const handleBinaryMessage = ( incomingData ) => {
    try {
        const headerView = new DataView( incomingData.buffer.slice( 0, 9 ) );
        return {
            messageType : headerView.getUint8( 0 ),
            messageData : new Uint8Array( incomingData.buffer.slice( 9 ) ),
            messageId   : headerView.getUint32( 1, false ),
            packetId    : headerView.getUint32( 5, false )
        };
    } catch ( error ) {
        console.log( "🚀 ~ error", error );
    }
};


wss.on( "open", () => {

    function ping() {
        setInterval( () => {
            console.log( "----- SENDING PING ------ " );
            wss.ping();
        }, 30000 );
    }

    console.log( "CONNECTED" );

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

    ping();
} );

wss.on( "error", ( err ) => {
    console.log( "🚀 ~ WSS ERROR", err );
} );

wss.on( "message", ( data, isBinary ) => {
    if ( isBinary ) {
        const binary = handleBinaryMessage( data );
        // console.log( "🚀 ~ DATA isBinary", binary );
        return;
    }
    console.log( " 💌  --- received: %s", data );
} );

wss.on( "ping", () => {
    console.log( " 🏓  --- Received PING from Server" );
} );

wss.on( "pong", () => {
    console.log( " 🏓  --- Received PONG from Server" );
} );