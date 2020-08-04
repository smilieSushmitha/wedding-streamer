// recording is disabled because it is resulting for browser-crash
// if you enable below line, please also uncomment above "RecordRTC.js"
var enableRecordings = false;
var connection = new RTCMultiConnection();
var ismute = false;
var isVideoVisibe = true;
// https://www.rtcmulticonnection.org/docs/iceServers/
// use your own TURN-server here!
connection.iceServers = [{
    'urls': [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.l.google.com:19302?transport=udp',
    ]
}];

document.getElementById("streamer-video-div").style.display = "none";
document.getElementById("open-broadcast").style.display = "block";

// its mandatory in v3
connection.enableScalableBroadcast = true;

// each relaying-user should serve only 1 users
connection.maxRelayLimitPerUser = 1;

// we don't need to keep room-opened
// scalable-broadcast.js will handle stuff itself.
connection.autoCloseEntireSession = true;

// by default, socket.io server is assumed to be deployed on your own URL
connection.socketURL = '/';

// comment-out below line if you do not have your own socket.io server
// connection.socketURL = 'https://rtcmulticonnection.herokuapp.com:443/';

connection.socketMessageEvent = 'scalable-media-broadcast-demo';

// document.getElementById('broadcast-id').value = connection.userid;

// user need to connect server, so that others can reach him.
connection.connectSocket(function(socket) {

    // this event is emitted when a broadcast is already created.
    socket.on('join-broadcaster', function(hintsToJoinBroadcast) {

        connection.session = hintsToJoinBroadcast.typeOfStreams;
        connection.sdpConstraints.mandatory = {
            OfferToReceiveVideo: !!connection.session.video,
            OfferToReceiveAudio: !!connection.session.audio
        };
        connection.broadcastId = hintsToJoinBroadcast.broadcastId;
        connection.join(hintsToJoinBroadcast.userid);
    });

    socket.on('rejoin-broadcast', function(broadcastId) {

        connection.attachStreams = [];
        socket.emit('check-broadcast-presence', broadcastId, function(isBroadcastExists) {
            if (!isBroadcastExists) {
                // the first person (i.e. real-broadcaster) MUST set his user-id
                connection.userid = broadcastId;
            }

            socket.emit('join-broadcast', {
                broadcastId: broadcastId,
                userid: connection.userid,
                typeOfStreams: connection.session
            });
        });
    });

    socket.on('broadcast-stopped', function(broadcastId) {
        console.error('broadcast-stopped', broadcastId);
        alert('This broadcast has been stopped.');


        document.getElementById("streamer-video-div").style.display = "none";
        document.getElementById("open-broadcast").style.display = "block";

    });

    // this event is emitted when a broadcast is absent.
    socket.on('start-broadcasting', function(typeOfStreams) {

        // host i.e. sender should always use this!
        connection.sdpConstraints.mandatory = {
            OfferToReceiveVideo: false,
            OfferToReceiveAudio: false
        };
        connection.session = typeOfStreams;

        // "open" method here will capture media-stream
        // we can skip this function always; it is totally optional here.
        // we can use "connection.getUserMediaHandler" instead
        connection.open(connection.userid);
    });
});

var videoPreview = document.getElementById('streamer-video-preview');

connection.onstream = function(event) {
    if (connection.isInitiator && event.type !== 'local') {
        return;
    }

    connection.isUpperUserLeft = false;
    videoPreview.srcObject = event.stream;
    videoPreview.play();

    videoPreview.userid = event.userid;

    if (event.type === 'local') {
        videoPreview.muted = true;
    }

    if (connection.isInitiator == false && event.type === 'remote') {
        // he is merely relaying the media
        connection.dontCaptureUserMedia = true;
        connection.attachStreams = [event.stream];
        connection.sdpConstraints.mandatory = {
            OfferToReceiveAudio: false,
            OfferToReceiveVideo: false
        };

        connection.getSocket(function(socket) {
            socket.emit('can-relay-broadcast');

            if (connection.DetectRTC.browser.name === 'Chrome') {
                connection.getAllParticipants().forEach(function(p) {
                    if (p + '' != event.userid + '') {
                        var peer = connection.peers[p].peer;
                        peer.getLocalStreams().forEach(function(localStream) {
                            peer.removeStream(localStream);
                        });
                        event.stream.getTracks().forEach(function(track) {
                            peer.addTrack(track, event.stream);
                        });
                        connection.dontAttachStream = true;
                        connection.renegotiate(p);
                        connection.dontAttachStream = false;
                    }
                });
            }

            if (connection.DetectRTC.browser.name === 'Firefox') {
                // Firefox is NOT supporting removeStream method
                // that's why using alternative hack.
                // NOTE: Firefox seems unable to replace-tracks of the remote-media-stream
                // need to ask all deeper nodes to rejoin
                connection.getAllParticipants().forEach(function(p) {
                    if (p + '' != event.userid + '') {
                        connection.replaceTrack(event.stream, p);
                    }
                });
            }

            // Firefox seems UN_ABLE to record remote MediaStream
            // WebAudio solution merely records audio
            // so recording is skipped for Firefox.
            if (connection.DetectRTC.browser.name === 'Chrome') {
                repeatedlyRecordStream(event.stream);
            }
        });
    }

    // to keep room-id in cache
    localStorage.setItem(connection.socketMessageEvent, connection.sessionid);
};


document.getElementById('mute-button').onclick = function() {
    if(ismute){
        if (connection.streamEvents.selectFirst().userid === broadcastId) {
            connection.streamEvents.selectFirst().stream.unmute('audio');
            ismute = false;
        }
    } else {
        if (connection.streamEvents.selectFirst().userid === broadcastId) {
            connection.streamEvents.selectFirst().stream.mute('audio');
            ismute = true;
        }
    }
};

document.getElementById('stop-video').onclick =function(){
    if(isVideoVisibe){
        if (connection.streamEvents.selectFirst().userid === broadcastId) {
            connection.streamEvents.selectFirst().stream.mute('video');
            isVideoVisibe = false;
        }
    } else {
        if (connection.streamEvents.selectFirst().userid === broadcastId) {
            connection.streamEvents.selectFirst().stream.unmute();
            isVideoVisibe = true;
        }
    }
};


// ask node.js server to look for a broadcast
// if broadcast is available, simply join it. i.e. "join-broadcaster" event should be emitted.
// if broadcast is absent, simply create it. i.e. "start-broadcasting" event should be fired.
document.getElementById('open-broadcast').onclick = function() {
    var broadcastId = 'arif';
    connection.extra.broadcastId = 'arif';

    connection.session = {
        audio: true,
        video: true,
        oneway: true
    };

    connection.getSocket(function(socket) {
        socket.emit('check-broadcast-presence', broadcastId, function(isBroadcastExists) {
            if (!isBroadcastExists) {
                // the first person (i.e. real-broadcaster) MUST set his user-id

                document.getElementById("streamer-video-div").style.display = "block";
                document.getElementById("open-broadcast").style.display = "none";
                connection.userid = broadcastId;
                socket.emit('join-broadcast', {
                    broadcastId: broadcastId,
                    userid: connection.userid,
                    typeOfStreams: connection.session
                });
            } else {
                alert('Broadcast already started in other browser');
                window.close();
            }

            console.log('check-broadcast-presence', broadcastId, isBroadcastExists);

        });
    });
};

connection.onstreamended = function() {};

connection.onleave = function(event) {
    if (event.userid !== videoPreview.userid) return;

    connection.getSocket(function(socket) {
        socket.emit('can-not-relay-broadcast');

        connection.isUpperUserLeft = true;

        if (allRecordedBlobs.length) {
            // playing lats recorded blob
            var lastBlob = allRecordedBlobs[allRecordedBlobs.length - 1];
            videoPreview.src = URL.createObjectURL(lastBlob);
            videoPreview.play();
            allRecordedBlobs = [];
        } else if (connection.currentRecorder) {
            var recorder = connection.currentRecorder;
            connection.currentRecorder = null;
            recorder.stopRecording(function() {
                if (!connection.isUpperUserLeft) return;

                videoPreview.src = URL.createObjectURL(recorder.getBlob());
                videoPreview.play();
            });
        }

        if (connection.currentRecorder) {
            connection.currentRecorder.stopRecording();
            connection.currentRecorder = null;
        }
    });
};

var allRecordedBlobs = [];

function repeatedlyRecordStream(stream) {
    if (!enableRecordings) {
        return;
    }

    connection.currentRecorder = RecordRTC(stream, {
        type: 'video'
    });

    connection.currentRecorder.startRecording();

    setTimeout(function() {
        if (connection.isUpperUserLeft || !connection.currentRecorder) {
            return;
        }

        connection.currentRecorder.stopRecording(function() {
            allRecordedBlobs.push(connection.currentRecorder.getBlob());

            if (connection.isUpperUserLeft) {
                return;
            }

            connection.currentRecorder = null;
            repeatedlyRecordStream(stream);
        });
    }, 30 * 1000); // 30-seconds
}

// ......................................................
// ......................Handling broadcast-id................
// ......................................................

var broadcastId = '';
if (localStorage.getItem(connection.socketMessageEvent)) {
    broadcastId = localStorage.getItem(connection.socketMessageEvent);
} else {
    broadcastId = connection.token();
}
var txtBroadcastId = 123;
txtBroadcastId.value = broadcastId;
txtBroadcastId.onkeyup = txtBroadcastId.oninput = txtBroadcastId.onpaste = function() {
    localStorage.setItem(connection.socketMessageEvent, this.value);
};

// below section detects how many users are viewing your broadcast

connection.onNumberOfBroadcastViewersUpdated = function(event) {
    if (!connection.isInitiator) return;

    document.getElementById('broadcast-viewers-counter').innerHTML = 'Number of broadcast viewers: <b>' + event.numberOfBroadcastViewers + '</b>';
};


function openFullscreen() {
    if (videoPreview.requestFullscreen) {
        videoPreview.requestFullscreen();
    } else if (videoPreview.mozRequestFullScreen) { /* Firefox */
        videoPreview.mozRequestFullScreen();
    } else if (videoPreview.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
        videoPreview.webkitRequestFullscreen();
    } else if (videoPreview.msRequestFullscreen) { /* IE/Edge */
        videoPreview.msRequestFullscreen();
    }
}

function ext() {
    console.log('ext');
    window.open('', '_self', '');
    window.close();
}
