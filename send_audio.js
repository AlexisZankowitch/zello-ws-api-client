const Buffer = require( "buffer/" ).Buffer;
const WebSocket = require( "ws" );
const OpusFileStream = require( "./opus-file-stream" );
const config = require( "./config.json" );

// Global constiables to handle user's SIGINT action
let zelloSocket = null;
let zelloStreamId = null;


const zelloUsername = config.users.sender.username;
const zelloPassword = config.users.sender.password;
const zelloChannel = config.channels;
const zelloFilename = "media.opus";

if ( !zelloUsername || !zelloPassword || !zelloChannel || !zelloFilename ) {
    console.error( "Invalid config file. See example" );
    process.exit( 1 );
}

function zelloAuthorize( ws, opusStream, username, password, channel, onCompleteCb ) {
    ws.send( JSON.stringify( {
        seq      : 1,
        command  : "logon",
        username : username,
        password : password,
        channels : channel,
    } ) );

    let isAuthorized = false, isChannelAvailable = false;
    const authTimeoutMs = 2000;
    const authTimeout = setTimeout( onCompleteCb, authTimeoutMs, false );
    ws.onmessage = function( event ) {
        // console.log( "🚀 ~ event", event );
        try {
            const json = JSON.parse( event.data );
            isAuthorized = true;
            // isChannelAvailable = true;
            // I don't send the token so I won't get a refresh token

            // console.log("🚀 ~ json", json)
            // if (json.refresh_token) {
            //     isAuthorized = true;
            // } else 
            if ( json.command === "on_channel_status" && json.status === "online" ) {
                isChannelAvailable = true;
            }
        } catch ( e ) {
            // Not a JSON - ignore the message
            return;
        }
        if ( isAuthorized && isChannelAvailable ) {
            clearTimeout( authTimeout );
            return onCompleteCb( true );
        }
    };
}

function zelloStartStream( ws, opusStream, onCompleteCb ) {
    let codecHeaderRaw = new Uint8Array( 4 );
    codecHeaderRaw[2] = opusStream.framesPerPacket;
    codecHeaderRaw[3] = opusStream.packetDurationMs;

    // sampleRate is represented in two bytes in little endian.
    // https://github.com/zelloptt/zello-channel-api/blob/409378acd06257bcd07e3f89e4fbc885a0cc6663/sdks/js/src/classes/utils.js#L63
    codecHeaderRaw[0] = parseInt( opusStream.sampleRate & 0xff, 10 );
    codecHeaderRaw[1] = parseInt( opusStream.sampleRate / 0x100, 10 ) & 0xff;
    const codecHeader = Buffer.from( codecHeaderRaw ).toString( "base64" );

    ws.send( JSON.stringify( {
        "command"         : "start_stream",
        "seq"             : 2,
        "type"            : "audio",
        "codec"           : "opus",
        "codec_header"    : codecHeader,
        "channel"         : config.channels[0],
        "packet_duration" : opusStream.packetDurationMs,
    } ) );

    const startTimeoutMs = 2000;
    const startTimeout = setTimeout( onCompleteCb, startTimeoutMs, null );
    ws.onmessage = function( event ) {
        try {
            const json = JSON.parse( event.data );
            console.log( "🚀 ~ json", json );
            if ( json.success && json.stream_id ) {
                clearTimeout( startTimeout );
                return onCompleteCb( json.stream_id );
            } else if ( json.error ) {
                console.log( "Got an error: " + json.error );
                clearTimeout( startTimeout );
                return onCompleteCb( null );
            }
        } catch ( e ) {
            // Not a JSON - ignore the message
            return;
        }
    };
}

function getCurrentTimeMs() {
    const now = new Date();
    return now.getTime();
}

function zelloGenerateAudioPacket( data, streamId, packetId ) {
    // https://github.com/zelloptt/zello-channel-api/blob/master/API.md#stream-data
    let packet = new Uint8Array( data.length + 9 );
    packet[0] = 1;

    let id = streamId;
    for ( let i = 4; i > 0; i-- ) {
        packet[i] = parseInt( id & 0xff, 10 );
        id = parseInt( id / 0x100, 10 );
    }

    id = packetId;
    for ( let i = 8; i > 4; i-- ) {
        packet[i] = parseInt( id & 0xff, 10 );
        id = parseInt( id / 0x100, 10 );
    }
    packet.set( data, 9 );
    return packet;
}

function zelloSendAudioPacket( ws, packet, startTsMs, timeStreamingMs, onCompleteCb ) {
    const timeElapsedMs = getCurrentTimeMs() - startTsMs;
    const sleepDelayMs = timeStreamingMs - timeElapsedMs;

    ws.send( packet );
    if ( sleepDelayMs < 1 ) {
        return onCompleteCb();
    }
    setTimeout( onCompleteCb, sleepDelayMs );
}

function zelloStreamSendAudio( ws, opusStream, streamId, onCompleteCb ) {
    const startTsMs = getCurrentTimeMs();
    let timeStreamingMs = 0;
    let packetId = 0;
    const zelloStreamNextPacket = function() {
        opusStream.getNextOpusPacket( null, false, function( data ) {
            if ( !data ) {
                console.log( "Audio stream is over" );
                return onCompleteCb( true );
            }

            const packet = zelloGenerateAudioPacket( data, streamId, packetId );
            timeStreamingMs += opusStream.packetDurationMs;
            packetId++;
            zelloSendAudioPacket( ws, packet, startTsMs, timeStreamingMs, function() {
                return zelloStreamNextPacket();
            } );
        } );
    };
    zelloStreamNextPacket();
    ws.onmessage = function() {
        return;
    };
}

function zelloStopStream( ws, streamId ) {
    ws.send( JSON.stringify( {
        command   : "stop_stream",
        stream_id : streamId } ) );
    // Invalidate the global stream ID once stop request is sent
    zelloStreamId = null;
}

function zelloStreamReadyCb( opusStream, username, password, channel ) {
    const ws = new WebSocket( config.wss );

    ws.onerror = function() {
        console.error( "Websocket error" );
        ws.close();
    };

    ws.onclose = function() {
        if ( !zelloSocket ) {
            console.error( "Failed to connect to server" );
        }
        zelloSocket = null;
        if ( zelloStreamId ) {
            console.error( "Connection has been closed unexpectedly" );
            process.exit( 1 );
        } else {
            process.exit();
        }
    };

    ws.onopen = function() {
        zelloSocket = ws;

        zelloAuthorize( ws, opusStream, username, password, channel, function( success ) {
            ws.onmessage = null;
            if ( !success ) {
                console.error( "Failed to authorize" );
                ws.close();
            } else {
                console.log( "User " + username + " has been authenticated on " + channel + " channel" );
                zelloStartStream( ws, opusStream, function( streamId ) {
                    ws.onmessage = null;
                    if ( !streamId ) {
                        console.error( "Failed to start Zello stream" );
                        ws.close();
                    } else {
                        zelloStreamId = streamId;
                        console.log( "Started streaming " + opusStream.filename );
                        zelloStreamSendAudio( ws, opusStream, streamId, function( success ) {
                            if ( !success ) {
                                console.error( "Failed to stream audio" );
                            }
                            zelloStopStream( ws, streamId );
                            ws.close();
                            process.exit();
                        } );
                    }
                } );
            }
        } );
    };
}

process.on( "SIGINT", function() {
    console.log( "Stopped by user" );
    if ( zelloSocket ) {
        if ( zelloStreamId ) {
            zelloStopStream( zelloSocket, zelloStreamId );
        }
        zelloSocket.close();
    }
    process.exit();
} );

try {
    new OpusFileStream( zelloFilename, function( opusStream ) {
        if ( !opusStream ) {
            console.error( "Failed to start Opus media stream" );
            process.exit( 1 );
        }
        console.log( "Starting application" );
        zelloStreamReadyCb( opusStream, zelloUsername, zelloPassword, zelloChannel );
    } );
} catch ( error ) {
    console.log( "🚀 ~ error", error );
}
