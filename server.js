const ADDRESS = 'localhost';
const PORT = 5000;

var express = require('express');
var sock = require('socket.io');

var app = express();
var server = app.listen(5000, function(){
    console.log("listening to requests on port 5000")
})

// static
app.use(express.static(__dirname + '/public'));

// Socket setup
var io = sock(server)


var isHost = 'No';
var noLists = 0;
var hostID = null;
var idInRoomList = [];
var idConnectList = [];
const MAX_CLIENTS = 50;
var room = 'ActionLab'
var hostIP = ADDRESS+ ':' + PORT;

io.on('connection', (socket) => {
    console.log('\n----socket connecting for new connection or refresh on the browsers-----\n')

    // host IP address
    console.log('Host Ip is: ',hostIP)
    console.log('This visitor IP is: ',socket.handshake.headers.host)
    console.log('number of visitors: ', io.engine.clientsCount)
    console.log('Speaker is hosting in room: ' + isHost)
    console.log('Number of listensers in room: ' + noLists)
    console.log('All visitor IDs on connection: '+idConnectList)
    console.log('Listener IDs in the room: '+idInRoomList)

    idConnectList.push(socket.id)
    io.emit('update', io.engine.clientsCount, isHost, noLists, hostID);
    socket.emit('getIP', socket.handshake.headers.host)


    // Add 1 since we'll be adding ourselves shortly
    numClients = io.engine.clientsCount;

    console.log(`Room '${room}' now has ${isHost} host speaker(s)`);
    console.log(`Room '${room}' now has ${numClients} client(s)`);

    // room creating or joining codition for the host and the listener.
    if (hostIP == socket.handshake.headers.host){
        socket.emit('autoHost', room, socket.id);
        isHost = 'Yes'
    } else if (numClients > MAX_CLIENTS) {
        console.log(`Max clients (${MAX_CLIENT}) reached.`);
        socket.emit('full', room);
    } else if (numClients <= MAX_CLIENTS) {
        socket.emit('autoJoin', room, socket.id);
    }

    // when socket is disconnet
    socket.on('disconnect', () => {
        // socket.socket.reconnect();
        console.log('\n+++++   socket disconnecting +++++++\n')
     
        // update the socket id disconnect list
        var filtered = idConnectList.filter(function(value, index, arr){
            return value != socket.id;
        });
        idConnectList = filtered
       
        // remove the current disconnect id from room list
        var removeThisIDRoom = idInRoomList.filter(function(value, index, arr){
            return value != socket.id;
        });
  
        // update the id in room list
        var hostFound = removeThisIDRoom.filter(function(value, index, arr){
            return value == hostID;
        });

        idInRoomList = removeThisIDRoom

        // update number of listensers in room  
        var removeHostIDRoom = removeThisIDRoom.filter(function(value, index, arr){
            return value != hostID;
        });

        //  disconnet and reconnet update infos, 
        //  host id always exist once it created
        //  it use to identify lost host by replacing ip or some other info
        if (hostFound.length == 0){
            // host did refresh or close the broswer
            console.log('host refresh or disconnect:' + hostFound)
            isHost = 'No'
        } else {
            // listener refresh or close the brwoser
            console.log('listener refresh or disconnect: ' + hostFound)
           
        }

        noLists = removeHostIDRoom.length;
        io.emit('update', io.engine.clientsCount, isHost, noLists, hostID);
        
    });

    socket.on('join', (room, hostExist, listensers) => {

        isHost = hostExist;
        noLists = listensers;

        console.log('\n+++++++++ room joining +++++++++++\n')
        console.log('Received request to create or join room ' + room);

        let clientsInRoom = io.sockets.adapter.rooms[room];
        let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        
        // host and listener join the room condition
        if (hostIP == socket.handshake.headers.host) {
            socket.join(room);
            console.log(`Host ID ${socket.id} created room ${room}`);
            socket.emit('created', room, socket.id);
            hostID = socket.id
            idInRoomList.push(hostID)
            isHost = 'Yes'
            io.emit('update', io.engine.clientsCount, isHost, noLists, hostID);
            numClients += 1;
        } else if (numClients <= MAX_CLIENTS) {
            socket.join(room);
            console.log(`listenser ID ${socket.id} joined room ${room}`);
            socket.emit('joined', room, socket.id);
            io.to(room).emit('join', socket.id);
            idInRoomList.push(socket.id)
            io.emit('update', io.engine.clientsCount, isHost, noLists, hostID);
            numClients += 1;
        } else if (numClients > MAX_CLIENTS){
            console.log(`Max clients (${MAX_CLIENT}) reached.`);
            socket.emit('full', room);
        } else {
            console.log('else unknown condition');
        }

        console.log('All visitor IDs on connection: '+idConnectList)
        console.log('Listener IDs in the room: '+idInRoomList)
        console.log(`Room '${room}' now has ${isHost} host speaker(s)`);
        console.log(`Room '${room}' now has ${numClients} client(s)`);
    });

    socket.on('offer', (offer, recipientId) => {
        io.to(recipientId).emit('offer', offer, socket.id);
    });

    socket.on('answer', (answer, recipientId) => {
        io.to(recipientId).emit('answer', answer, socket.id);
    });

    socket.on('candidate', (candidate, recipientId) => {
        io.to(recipientId).emit('candidate', candidate, socket.id);
    });

});
