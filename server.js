const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const games = {}; 
let waitingPlayer = null; 
let matchmakingTimer = null; 

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('findRandomMatch', () => {
        if (waitingPlayer && waitingPlayer !== socket.id) {
            // Human match found! Cancel the bot timer.
            clearTimeout(matchmakingTimer);
            
            const gameId = Math.random().toString(36).substring(2, 9);
            games[gameId] = { players: [], moves: [] };

            const waitingSocket = io.sockets.sockets.get(waitingPlayer);

            if (waitingSocket) {
                games[gameId].players.push({ id: waitingSocket.id, color: 'w' });
                games[gameId].players.push({ id: socket.id, color: 'b' });

                waitingSocket.join(gameId);
                socket.join(gameId);

                waitingSocket.emit('randomMatchFound', { gameId, color: 'w' });
                socket.emit('randomMatchFound', { gameId, color: 'b' });
                io.to(gameId).emit('startGame');
            }
            waitingPlayer = null;
        } else {
            // Nobody is waiting. Start the 40-SECOND timer!
            waitingPlayer = socket.id;
            socket.emit('waitingForRandom');

            // ⏱️ Start 40-second countdown (40000 milliseconds)
            matchmakingTimer = setTimeout(() => {
                if (waitingPlayer === socket.id) {
                    waitingPlayer = null; 
                    
                    const botElo = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
                    const botNames = ["BlunderBot", "PawnPusher", "KnightRider", "WoodPusher", "CheckmateChad"];
                    const randomName = botNames[Math.floor(Math.random() * botNames.length)] + "_" + Math.floor(Math.random()*999);

                    socket.emit('botMatchFallback', { elo: botElo, name: randomName });
                }
            }, 40000); // <-- CHANGED TO 40 SECONDS
        }
    });

    socket.on('joinGame', (gameId) => {
        if (!games[gameId]) { games[gameId] = { players: [], moves: [] }; }
        const game = games[gameId];
        if (game.players.length >= 2) { socket.emit('error', 'Game full.'); return; }

        const color = game.players.length === 0 ? 'w' : 'b';
        game.players.push({ id: socket.id, color });
        socket.join(gameId);
        socket.emit('playerColor', color);

        if (game.players.length === 2) { io.to(gameId).emit('startGame'); }
    });

    socket.on('makeMove', ({ gameId, move }) => {
        socket.to(gameId).emit('moveMade', move);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (waitingPlayer === socket.id) {
            waitingPlayer = null;
            clearTimeout(matchmakingTimer);
        }
        for (const gameId in games) {
            games[gameId].players = games[gameId].players.filter(p => p.id !== socket.id);
            if (games[gameId].players.length === 0) { delete games[gameId]; } 
            else { io.to(gameId).emit('playerLeft'); }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
