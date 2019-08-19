// Initialization-------------------------------------------------------
// set up only audio media stream.
const audioStreamConstraints = {
    audio: true,
    video: false
};

// Set up to exchange audio/video
const offerOption = {
    offerToReceiveAudio: true
};

// Setup Web Audio components
window.AudioContext = (window.AudioContext || window.webkitAudioContext);
var context = new AudioContext({
        sampleRate: 44100,
});

// change running if it is suspended
if (context.state !== 'running') {
    context.resume();
}

// create the node for audio data structure
var streamNode;
var outStreamNode = context.createMediaStreamDestination();
var inGainNode = context.createGain();
var outGainNode = context.createGain();
inGainNode.connect(context.destination);
outGainNode.connect(outStreamNode);


// Define media elements.
const localMedia = document.getElementById('localMedia');

// listener play button elements
var playButton = document.getElementById('playButton');
// Socket ID element
const socketIdElem = document.getElementById('socketId');

// use for updating the room info for the server
var noVistsElem = document.getElementById('numOfvisitor');
var noListElem = document.getElementById('numOfListener');
var noHostElem = document.getElementById('hostExist');

// RTC server configuration.
const servers = null;  
var waitForHost;

// Define functions --------------------------------------------                       

// Setup local media streams
async function getAudioStream() {
    return new Promise((resolve, reject) => {

        // get audio source object
        navigator.mediaDevices.getUserMedia(audioStreamConstraints)
        .then((stream) => {
            gotStream(stream);
            resolve();
        })
        .catch((e) => {
            console.warn(`Failed to get audio stream: ${e}`);
            reject();
        });
    });
}


function gotStream(audioStream) {
    // disconnect the old one and create a new one
    if (streamNode) {
        streamNode.disconnect();
    }

    streamNode = context.createMediaStreamSource(audioStream);
    streamNode.connect(outGainNode);
    trace('Connected streamNode.');
}

// Logs an action (text) and the time when it happened on the console.
function trace(text) {
    text = text.trim();
    const now = (performance.now() / 1000).toFixed(3);
    console.log(now, text);
}

// WebRTC connection by creating peer object
class Peer {
    constructor(id, socket) {
        this.id = id;
        this.socket = socket; 
        // this.initiated = false;
        this.offered = false;
        this.answered = false;
        this.conn = null;
        this.sendChannel = null;
        this.recvChannel = null;
        this.iceCandidates = [];
        this.remoteStream = null;
        this.audioElem = null;
    
        this.audioNode = null;
        this.gainNode = null;
        this.muteButton = null;

        this.conn = new RTCPeerConnection(servers, {  });
        trace('Created local peer connection object.');
    
        // Use arrow function so that 'this' is available in class methods
        this.conn.addEventListener('icecandidate', (event) => {
            this.processIceCan(event);
        });
        this.conn.addEventListener('iceconnectionstatechange', (event) => {
            this.processUpdateConn(event);
        });
        this.conn.addEventListener('track', (event) => {
            this.gotRemoteAudioStream(event);
        });

        // Set up additional data channel to pass messages peer-to-peer
        // There is a separate channel for sending and receiving
        this.sendChannel = this.conn.createDataChannel('session-info');
        this.sendChannel.addEventListener('open', (event) => {
            trace(`Data channel to ${this.id} opened.`);
        });

        this.conn.addEventListener('datachannel', (event) => {
            trace(`Received data channel '${event.channel.label}' from ${this.id}.`);
            this.recvChannel = event.channel;

            this.recvChannel.addEventListener('message', (event) => {
                trace(`Message received from ${this.id}:`);
                console.dir(JSON.parse(event.data));
            });

            // Send an initial message
            this.sendChannel.send(JSON.stringify({ type: 'msg', contents: 'hello' }));
        });
    }

    cleanup() {

        if (this.audioElem) {
            this.audioElem.remove();
        }

        if (this.audioNode) {
            this.audioNode.disconnect();
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
        }

        if (this.muteButton) {
            this.muteButton.remove();
        }

        this.iceCandidates = [];
    }

    reconnect() {
        this.cleanup();
    }

    disconnect() {
        this.conn.close();
        this.sendChannel.close();
        if (this.recvChannel) {
            this.recvChannel.close();
        }
        this.cleanup();

        // TODO: This is meh coupling
        this.socket.disconnected(this.id);
        trace(`Disconnected from ${this.id}.`);
    }

    // Connects with new peer candidate.
    processIceCan(event) {
        if (event.candidate) {
            this.socket.socket.emit('candidate', event.candidate, this.id);
            trace(`Sent ICE candidate to ${this.id}.`);
        }
    }

    // Logs changes to the connection state.
    processUpdateConn(event) {
        trace(`ICE state changed to: ${event.target.iceConnectionState}.`);

        if (event.target.iceConnectionState === 'disconnected') { 
            this.disconnect();
        }
    }

    clearIceCan() {
        if (!(this.conn && this.conn.remoteDescription && this.conn.remoteDescription.type)) {
            console.warn(`Connection was not in a state for uncaching.`);
            return;
        }

        this.iceCandidates.forEach((candidate) => {
            trace(`Added cached ICE candidate`);
            this.conn.addIceCandidate(candidate);
        });

        this.iceCandidates = [];
    }

    // Handles remote MediaStream success by adding it as the remoteVideo src.
    gotRemoteAudioStream(event) {
        console.log("it is in gotRemote here")
        this.remoteStream = event.streams[0];
        var audioTracks = this.remoteStream.getAudioTracks();

        // Make sure we actually have audio tracks
        if (audioTracks.length > 0) {
            
            // generate mute button for the client
            if (this.id == socket.hostID) {
                        
                // Setup mute button logic
                this.muteButton = document.createElement('button')
                this.muteButton.innerHTML = 'play';
                this.muteButton.addEventListener('click', () => {
                    
                    if (this.audioElem == null){
                        var audioElem = new Audio();
                        audioElem.crossOrigin = 'anonymous'
                        audioElem.autoplay = true;
                        audioElem.controls = true;
                        audioElem.muted = true;
                        audioElem.srcObject = this.remoteStream;
                        audioElem.addEventListener('canplaythrough', () => {
                            audioElem.pause();
                            audioElem = null;
                        });
                        this.gainNode = context.createGain();
                        this.gainNode.connect(inGainNode);
                        this.audioNode = context.createMediaStreamSource(this.remoteStream);
                        this.audioNode.connect(this.gainNode);
            
                        this.audioElem = audioElem;
                        context.resume()
                    }
                
                    if (this.muteButton.innerHTML === 'stop') {
                        this.muteButton.style.backgroundColor = 'green'
                        this.gainNode.gain.value = 0;
                        this.muteButton.innerHTML = 'play';
                        console.log("in stop")
                        
                    } else {
                        this.muteButton.style.backgroundColor = 'red'
                        this.gainNode.gain.value = 1;
                        this.muteButton.innerHTML = 'stop';
                        console.log("in play")
                        console.log(context)
                    
                    }    

                });
                playButton.appendChild(this.muteButton);
        
            }
        }
        trace(`Received remote stream from ${this.id}.`);
    }
}

// function for creating a new Peer and connecting streams to it.

async function createPeer(id, socket) {
    trace(`Starting connection to ${id}...`);

    // Mask global localStream on purpose
    // Easily revertible to old style streams from WebAudio changes
    var localStream = outStreamNode.stream;

    var peer = null;
    var audioTracks = null;
    audioTracks = localStream.getAudioTracks();

    trace(`Audio tracks:`);

    if (audioTracks.length > 0) {
        trace(`Using audio device: ${audioTracks[0].label}.`);
    }

    // Create peer connections and add behavior.
    peer = new Peer(id, socket);
    // Add local stream to connection and create offer to connect.

    if (audioTracks[0]) {
        peer.conn.addTrack(audioTracks[0], localStream);
    }
    return peer;
}


// socket.io for websocket
class Socket {
    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
        this.rooms = [];
        this.peers = {};
        this.isHostSpeaker = 'No';
        this.numOfListeners = 0;
        this.numOfVisitors = 0;
        this.hostID = null;

        this.socket = io.connect(`http://${this.ip}:${this.port}`);

        trace(`Created socket.`);

        // This is emitted when this socket successfully creates
        this.socket.on('created', (room, socketId) => {
            trace(`${socketId} successfully created ${room}.`);
            socketIdElem.innerHTML = this.socket.id;
            this.rooms.push(room);
            this.hostID = this.socket.id;
        });

        async function getAudioSource(room, hostExist){
            if (hostExist === 'No'){
                await getAudioStream();
                listensers = document.getElementById('numOfListener').innerHTML;
                socket.joinRoom(room, hostExist, listensers);
                document.getElementById('streamFromAction').innerHTML = 'You are a host in room'
            }
        }

        this.socket.on('autoHost', (room, socketId) => {
            hostExist = document.getElementById('hostExist').innerHTML;
            getAudioSource(room, hostExist)
        });

        this.socket.on('autoJoin', (room, socketId) => {
            console.log("autoJoin:   " + room)
            hostExist = document.getElementById('hostExist').innerHTML;
            listensers = document.getElementById('numOfListener').innerHTML;
            if (hostExist === 'Yes') {
                listensers ++;
                socket.joinRoom(room, hostExist, listensers);
            }
        });

        // This is emitted when this socket successfully joins
        this.socket.on('joined', (room, socketId) => {
            trace(`${socketId} successfully joined ${room}.`);
            socketIdElem.innerHTML = this.socket.id;
            console.log('----room joined')
            this.rooms.push(room);
        });

        // when reach the maxmium clients
        this.socket.on('full', (room) => {
            console.warn(`Room ${room} is full.`);
        });

        // This is emitted when someone else joins
        this.socket.on('join', async (socketId) => {
            // Have to ignore our own join
            if (socketId === this.socket.id) {
                return;
            }

            var peer = this.peers[socketId];
            trace(`'${socketId}' joined.`);

            // Close old one if connection already existing
            if (peer) {
                this.handleDisconnect(peer.id);
            }

            peer = await createPeer(socketId, this);
            this.peers[peer.id] = peer;
            peer.offered = true;

            trace(`createOffer to ${socketId} started.`);
            var offer = await peer.conn.createOffer(offerOption);
            await peer.conn.setLocalDescription(offer);
            this.socket.emit('offer', offer, peer.id);
        });

        this.socket.on('offer', async (offer, socketId) => {
            var peer = this.peers[socketId];
            trace(`Offer received from ${socketId}:`);
            console.dir(offer);

            // Peer might exist because of ICE candidates
            if (peer) {
                console.warn(`Peer already existed at offer.`);
                peer.reconnect();
            } else {
                peer = await createPeer(socketId, this);
                this.peers[peer.id] = peer;
            }

            peer.answered = true;
            await peer.conn.setRemoteDescription(offer);
            var answer = await peer.conn.createAnswer(offerOption);
            await peer.conn.setLocalDescription(answer);
            this.socket.emit('answer', answer, socketId);

            // Restore any cached ICE candidates
            peer.clearIceCan();
        });

        this.socket.on('answer', async (answer, socketId) => {
            var peer = this.peers[socketId];

            // Make sure we're expecting an answer
            if (!(peer && peer.offered)) {
                console.warn(`Unexpected answer from ${socketId} to ${this.socket.id}.`);
                return;
            }

            trace(`Answer received from ${socketId}:`);
            console.dir(answer);
            await peer.conn.setRemoteDescription(answer);

            // Restore any cached ICE candidates
            peer.clearIceCan();
        });

        this.socket.on('candidate', async (candidate, ownerId) => {
            var peer = this.peers[ownerId];
            
            // Make sure we're expecting candidates
            if (!(peer && (peer.offered || peer.answered))) {
                console.warn(`Unexpected ICE candidates from ${ownerId} to ${this.socket.id}.`);
                return;
            }
            trace(`Received ICE candidate for ${ownerId}.`);
            var iceCandidate = new RTCIceCandidate(candidate);

            // Cache ICE candidates if the connection isn't ready yet
            if (peer.conn && peer.conn.remoteDescription && peer.conn.remoteDescription.type) {
                if (iceCandidate.candidate !== ''){
                    await peer.conn.addIceCandidate(iceCandidate);
                }
            } else {
                trace(`Cached ICE candidate`);
                peer.iceCandidates.push(iceCandidate);
            }
        
        });

        // updating the information when event happen
        this.socket.on('update', (numOfVisitor, isHostSpeaker, listensers, hostID) => {
            this.numOfVisitors = numOfVisitor;
            this.numOfListeners = listensers;
            this.isHostSpeaker = isHostSpeaker;
            this.hostID = hostID;
            noVistsElem.innerHTML = this.numOfVisitors;
            noListElem.innerHTML = this.numOfListeners;
            noHostElem.innerHTML = this.isHostSpeaker;
            if(isHostSpeaker == 'No'){
                waitForHost = document.createElement('messageClient')
                waitForHost.innerHTML = 'Host disconnected!!!'
                playButton.appendChild(waitForHost);
            } else {
                if(waitForHost){
                    waitForHost.innerHTML = 'Host is speaking! Refresh the page!'
                }
                
            } 

        });
    }

    // join room function when someone create or join the room
    joinRoom(room, hostExist, listensers) {
        trace(`Entering room '${room}'...`);
        this.socket.emit('join', room, hostExist, listensers);
    }

    disconnected(id) {
        this.peers[id] = null;
        trace(`Removed ${id} from peer list.`);
    }

}

// UI Visualizer canvas
var alyzNode = context.createAnalyser();

alyzNode.smoothingTimeConstant = 0.6;
alyzNode.fftSize = 2048;
alyzNode.minDecibels = -100;
alyzNode.maxDecibels = -10;

var vizFreqBin = new Uint8Array(alyzNode.frequencyBinCount);
var vizUpdateAnimation = requestAnimationFrame(updateGraph);
outGainNode.connect(alyzNode);
inGainNode.connect(alyzNode);

console.log(alyzNode.frequencyBinCount);

var visShape = document.getElementById('lineWave');

// Visualizer canvas
const visCanvas = document.getElementById('visualizer');
const visCtx = visCanvas.getContext('2d');

function updateGraph() {

    alyzNode.getByteFrequencyData(vizFreqBin);

    var width = visCanvas.width;
    var height = visCanvas.height;
    var barWidth = (width / (alyzNode.frequencyBinCount / 10)); // Estimation for now

    // Clear old points
    visCtx.clearRect(0, 0, width, height);
    visCtx.fillStyle = 'white';
    visCtx.fillRect(0, 0, width, height);
    visCtx.strokeStyle = 'black';

    visCtx.beginPath();
    visCtx.moveTo(0, height);

    var x = 0;
    var t = 2;

    var next = 1;
    for (var i = 0; i < alyzNode.frequencyBinCount; i += next) {
        next += i / (alyzNode.frequencyBinCount / 16);
        next = next - (next % 1);

        if (visShape) {
            var p0 = (i > 0) ? { x: x - barWidth, y: height - vizFreqBin[i - 1] } : { x: 0, y: 0 };
            var p1 = { x: x, y: height - vizFreqBin[i] };
            var p2 = (i < alyzNode.frequencyBinCount - 1) ? { x: x + barWidth, y: height - vizFreqBin[i + 1] } : p1;
            var p3 = (i < alyzNode.frequencyBinCount - 2) ? { x: x + 2 * barWidth, y: height - vizFreqBin[i + 2] } : p1;

            var cp1x = p1.x + (p2.x - p0.x) / 6 * t;
            var cp1y = p1.y + (p2.y - p0.y) / 6 * t;

            var cp2x = p2.x - (p3.x - p1.x) / 6 * t;
            var cp2y = p2.y - (p3.y - p1.y) / 6 * t;

            visCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }

        x += barWidth + 2;
    }

    visCtx.stroke();

    setTimeout(() => {
        vizUpdateAnimation = requestAnimationFrame(updateGraph);
    }, 30);
}
