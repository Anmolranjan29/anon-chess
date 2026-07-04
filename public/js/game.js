const socket = io();
let board = null;
let game = new Chess();
let gameId = window.location.hash.substring(1);
let playerColor = 'w'; 
let isBotGame = false;
let botElo = 100;
let selectedSquare = null;
let frontendCountdown = null; 

if (gameId) {
    isBotGame = false;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    document.getElementById('gameLink').innerText = `Share this link with a friend: ${window.location.href}`;
    document.getElementById('status').innerText = "Waiting for opponent to join...";
    socket.emit('joinGame', gameId);
}

function createNewGame() {
    const randomId = Math.random().toString(36).substring(2, 9);
    window.location.hash = randomId;
    window.location.reload();
}

function goHome() {
    window.history.replaceState(null, null, ' ');
    window.location.reload();
}

function formatTime(seconds) {
    let secs = seconds < 10 ? "0" + seconds : seconds;
    return "00:" + secs;
}

function findRandomGame() {
    isBotGame = false;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    document.getElementById('gameLink').innerText = "Searching global queue...";
    
    let secondsElapsed = 1; 
    document.getElementById('status').innerText = `🔍 Searching... ⏱️ ${formatTime(secondsElapsed)}`;
    
    if (frontendCountdown) clearInterval(frontendCountdown);
    
    frontendCountdown = setInterval(() => {
        secondsElapsed++;
        document.getElementById('status').innerText = `🔍 Searching... ⏱️ ${formatTime(secondsElapsed)}`;
    }, 1000);

    socket.emit('findRandomMatch');
}

socket.on('randomMatchFound', (data) => {
    clearInterval(frontendCountdown); 
    
    gameId = data.gameId; 
    playerColor = data.color;
    window.location.hash = gameId; 

    document.getElementById('gameLink').innerText = `Matched with a live player! Good luck!`;
    initBoard();
});

socket.on('botMatchFallback', (data) => {
    clearInterval(frontendCountdown); 
    
    isBotGame = true;
    botElo = data.elo;
    playerColor = Math.random() < 0.5 ? 'w' : 'b'; 
    
    window.history.replaceState(null, null, ' '); 

    document.getElementById('gameLink').innerText = `Matched! Playing vs ${data.name} (${botElo} Elo)`;
    initBoard();
    updateStatus();
    if (playerColor === 'b') { setTimeout(makeBotMove, 500); }
});

function startBotGame() {
    isBotGame = true;
    botElo = parseInt(document.getElementById('eloSelect').value);
    playerColor = Math.random() < 0.5 ? 'w' : 'b'; 
    
    document.getElementById('setup').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    document.getElementById('gameLink').innerText = `Playing Offline vs ${botElo} Elo Bot`;

    initBoard();
    updateStatus();
    if (playerColor === 'b') { setTimeout(makeBotMove, 500); }
}

socket.on('playerColor', (color) => {
    playerColor = color;
    initBoard();
});

socket.on('startGame', () => { document.getElementById('status').innerText = "⚔️ Game started! White's turn."; });

socket.on('moveMade', (move) => {
    game.move(move);
    board.position(game.fen());
    updateStatus();
});

socket.on('playerLeft', () => { document.getElementById('status').innerText = "🚪 Opponent disconnected. You win!"; });

function initBoard() {
    board = Chessboard('board', {
        draggable: true,
        position: 'start',
        orientation: playerColor === 'w' ? 'white' : 'black',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: onDragStart,
        onDrop: onDrop
    });
}

// --- UPGRADED HIGHLIGHTING LOGIC ---
function removeHighlights() { 
    $('#board [data-square]').removeClass('highlight-square highlight-legal'); 
}

function highlightLegalMoves(square) {
    removeHighlights();
    $('#board .square-' + square).addClass('highlight-square'); // Highlight selected piece
    
    let moves = game.moves({ square: square, verbose: true });
    if (moves.length === 0) return;

    // Highlight all possible landing squares
    for (let i = 0; i < moves.length; i++) {
        $('#board .square-' + moves[i].to).addClass('highlight-legal');
    }
}

$('#board').on('click', '[data-square]', function() {
    if (game.game_over()) return;
    if (game.turn() !== playerColor) return; 

    let square = $(this).attr('data-square');
    let piece = game.get(square);

    if (selectedSquare === null) {
        if (piece && piece.color === playerColor) { 
            selectedSquare = square; 
            highlightLegalMoves(square); 
        }
        return;
    }
    
    if (selectedSquare === square) { 
        selectedSquare = null; 
        removeHighlights(); 
        return; 
    }
    
    if (piece && piece.color === playerColor) { 
        selectedSquare = square; 
        highlightLegalMoves(square); 
        return; 
    }

    let move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
    if (move === null) { 
        selectedSquare = null; 
        removeHighlights(); 
        return; 
    }

    removeHighlights();
    selectedSquare = null;
    board.position(game.fen());

    if (!isBotGame) { socket.emit('makeMove', { gameId, move: { from: move.from, to: move.to, promotion: 'q' } }); }
    updateStatus();
    if (isBotGame && !game.game_over()) { setTimeout(makeBotMove, 600); }
});

function onDragStart(source, piece, position, orientation) {
    if (game.game_over()) return false;
    if ((playerColor === 'w' && piece.search(/^b/) !== -1) || (playerColor === 'b' && piece.search(/^w/) !== -1) || (game.turn() !== playerColor)) { return false; }
    
    // Highlight moves when dragging starts
    highlightLegalMoves(source);
}

function onDrop(source, target) {
    removeHighlights();
    selectedSquare = null;
    let move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    
    if (!isBotGame) { socket.emit('makeMove', { gameId, move: { from: source, to: target, promotion: 'q' } }); }
    updateStatus();
    if (isBotGame && !game.game_over()) { setTimeout(makeBotMove, 600); }
}

// --- BOT LOGIC (Unchanged) ---
function makeBotMove() {
    let possibleMoves = game.moves({ verbose: true });
    if (possibleMoves.length === 0) return;
    let selectedMove = null;

    if (botElo <= 400) { selectedMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)]; } 
    else if (botElo <= 900) {
        let captures = possibleMoves.filter(m => m.captured);
        if (captures.length > 0) {
            const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
            captures.sort((a, b) => (values[b.captured] || 0) - (values[a.captured] || 0));
            selectedMove = captures[0];
        } else { selectedMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)]; }
    } 
    else {
        let bestScore = -Infinity; let bestMoves = [];
        possibleMoves.forEach(move => {
            game.move(move);
            let score = evaluateBoard(game.board(), game.turn());
            game.undo();
            if (score > bestScore) { bestScore = score; bestMoves = [move]; } 
            else if (score === bestScore) { bestMoves.push(move); }
        });
        if (botElo === 1000 && Math.random() < 0.3) { selectedMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)]; } 
        else { selectedMove = bestMoves[Math.floor(Math.random() * bestMoves.length)]; }
    }
    game.move(selectedMove); board.position(game.fen()); updateStatus();
}

function evaluateBoard(board, currentTurn) {
    const pieceValues = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
    let totalEvaluation = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let piece = board[r][c];
            if (piece) {
                let value = pieceValues[piece.type];
                if (piece.color === game.turn()) { totalEvaluation += value; } else { totalEvaluation -= value; }
            }
        }
    }
    return totalEvaluation;
}

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'b' ? 'Black' : 'White';
    if (game.in_checkmate()) { status = `🎉 Game over, ${moveColor} is in checkmate.`; } 
    else if (game.in_draw()) { status = '🤝 Game over, drawn match.'; } 
    else {
        if (isBotGame) { status = game.turn() === playerColor ? "Your turn!" : "🤖 Bot is thinking..."; } 
        else { status = `${moveColor} to move.`; }
        if (game.in_check()) { status += ` (${moveColor} is in check!)`; }
    }
    document.getElementById('status').innerText = status;
}
