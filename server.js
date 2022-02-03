import { WebSocketServer } from "ws";
import { v4 } from "uuid";

const connections = new Map();

function heartbeat() {
    console.log( "🚀 ~ heartbeat received marked connection as alive: ", this._myId );
    connections.get( this._myId ).isAlive = true;
    this.isAlive = true;
}

const wss = new WebSocketServer( { port: 8080 } );

wss.on( "connection", function connection( ws ) {
    ws.isAlive = true;
    ws._myId = v4();

    connections.set( ws._myId, { isAlive: true } );

    console.log( "🚀 ~ ws._myId", ws._myId );

    ws.on( "pong", heartbeat );

    ws.on( "message", ( message ) => {
        console.log( "received: %s", message );
        ws.send( "Hello back" );
    } );
} );


const interval = setInterval( function ping() {
    wss.clients.forEach( function each( ws ) {
        console.log( "🚀 ~ map", connections.get( ws._myId ) );
    
        if ( ws.isAlive === false ) return ws.terminate();
    
        ws.isAlive = false;
        connections.get( ws._myId ).isAlive = false;
        ws.send( "Hello there?" );
        ws.ping();
        console.log( "🚀 ~ ws", { id: ws._myId, isAlive: ws.isAlive } );
    } );
}, 30000 );

wss.on( "close", function close() {
    clearInterval( interval );
} );