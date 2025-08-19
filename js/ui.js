// /js/ui.js

import { appState } from './gameState.js';

// --- DOM ELEMENTS ---
export const views = {
    home: document.getElementById('home-view'),
    tcgSelection: document.getElementById('tcg-selection-view'),
    gameSettingsModal: document.getElementById('game-settings-modal'),
    joinSessionModal: document.getElementById('join-session-modal'),
    gameRoom: document.getElementById('game-room-view'),
    presenter: document.getElementById('presenter-view'),
    chooseFirstPlayerModal: document.getElementById('choose-first-player-modal'),
    winnerModal: document.getElementById('winner-modal'),
    issueWinModal: document.getElementById('issue-win-modal'),
};

// --- ASSETS ---
const trainerSilhouetteSVG = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
const loreIconSVG = `<svg class="w-20 h-20 text-gray-200 lore-icon-glow" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.0001 2.40039L18.4001 12.0004L12.0001 21.6004L5.6001 12.0004L12.0001 2.40039ZM12.0001 7.68039L9.1201 12.0004L12.0001 16.3204L14.8801 12.0004L12.0001 7.68039Z"/></svg>`;

// --- UTILITY FUNCTIONS ---
export const formatTime = (ms) => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
};

export const playBuzzer = () => {
    try {
        const audioContext = new(window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        gainNode.gain.setValueAtTime(1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1);
    } catch (e) {
        console.error("Could not play buzzer sound:", e);
    }
};

// --- VIEW MANAGEMENT ---
export const showView = (viewName) => {
    appState.view = viewName;
    Object.keys(views).forEach(key => {
        if (views[key]) views[key].classList.add('hidden');
    });
    if (views[viewName]) views[viewName].classList.remove('hidden');
};

export const showModal = (modalName) => {
    if (views[modalName]) views[modalName].classList.remove('hidden');
};

export const hideModal = (modalName) => {
    if (views[modalName]) views[modalName].classList.add('hidden');
};

export const setupGameSettings = (tcg) => {
    appState.game.tcg = tcg;
    document.getElementById('player-name-input').value = appState.playerName;
    
    // Set UI based on TCG
    const isPokemon = tcg === 'pokemon';
    document.getElementById('prize-card-settings').style.display = isPokemon ? 'block' : 'none';
    document.getElementById('lorcana-lore-settings').style.display = isPokemon ? 'none' : 'block';

    // Show the modal. The event listeners in main.js will handle the timer UI.
    showModal('gameSettingsModal');
};

// --- RENDER FUNCTIONS ---
export const fullRender = () => {
    renderGameRoom();
    renderPresenter();

    if (appState.game.status === 'finished' && !appState.game.winnerAnnounced) {
        const winner = appState.game.players[appState.game.roundWinnerId];
        showWinnerAnimation(winner, true, appState.game.isTie);
    } else if (appState.game.status === 'game-over' && !appState.game.winnerAnnounced) {
        const winner = appState.game.players[appState.game.winnerId];
        showWinnerAnimation(winner, false, false);
    }
};

function renderGameRoom() {
    if (appState.view !== 'gameRoom') return;
    const { game, myId, isHost } = appState;

    document.getElementById('room-code-display').textContent = appState.roomCode;
    document.getElementById('player-role').textContent = isHost ? 'You are the Host' : 'You are the Guest';

    const menuDropdown = document.getElementById('game-menu-dropdown');
    menuDropdown.innerHTML = ''; // Clear old items
    if (isHost) {
        menuDropdown.innerHTML = `
            <a href="#" id="start-game-btn" class="block px-4 py-2 text-sm text-gray-200 hover:bg-blue-500 hover:text-white">Start Game</a>
            <a href="#" id="restart-round-btn" class="block px-4 py-2 text-sm text-gray-200 hover:bg-yellow-500 hover:text-white">Restart Round</a>
            <a href="#" id="issue-win-btn" class="block px-4 py-2 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white">Issue Win</a>
            <a href="#" id="kick-guest-btn" class="block px-4 py-2 text-sm text-gray-200 hover:bg-orange-500 hover:text-white">Kick Guest</a>
            <a href="#" id="end-session-btn" class="block px-4 py-2 text-sm text-gray-200 hover:bg-red-500 hover:text-white">End Session</a>
            <button id="open-presenter-btn" class="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-purple-500 hover:text-white">Open Presenter</button>
        `;
    } else {
        menuDropdown.innerHTML = `<a href="#" id="leave-battle-btn" class="block px-4 py-2 text-sm text-gray-200 hover:bg-red-500 hover:text-white">Leave Battle</a>`;
    }

    const me = game.players[myId];
    if (!me && !isHost) { // Allow host to see the room even if they aren't in players{} yet
        document.getElementById('waiting-for-opponent').style.display = 'block';
        document.getElementById('game-controls').style.display = 'none';
        return;
    }

    const connectedPlayerCount = Object.values(game.players).filter(p => p.connected).length;

    if (game.status === 'paused') {
        document.getElementById('waiting-for-opponent').style.display = 'none';
        document.getElementById('game-controls').style.display = 'block';
    } else {
        document.getElementById('waiting-for-opponent').style.display = connectedPlayerCount < 2 ? 'block' : 'none';
        document.getElementById('game-controls').style.display = connectedPlayerCount >= 2 ? 'block' : 'none';
    }

    const p1Id = Object.keys(game.players).find(id => game.players[id].isHost);
    const p2Id = Object.keys(game.players).find(id => !game.players[id].isHost);
    const p1Indicator = document.getElementById('player1-turn-indicator');
    const p2Indicator = document.getElementById('player2-turn-indicator');

    if (game.tcg === 'pokemon') {
        document.getElementById('pokemon-controls').classList.remove('hidden');
        document.getElementById('lorcana-controls').classList.add('hidden');
        if(me) renderPrizeCards(me);
        if (p1Id && game.players[p1Id]) {
            const p1 = game.players[p1Id];
            const p1PrizesLeft = game.prizeCount - p1.prizesTaken.length;
            document.getElementById('player1-name-turn').textContent = `${p1.name} (${p1PrizesLeft} Prizes)`;
        }
        if (p2Id && game.players[p2Id]) {
            const p2 = game.players[p2Id];
            const p2PrizesLeft = game.prizeCount - p2.prizesTaken.length;
            document.getElementById('player2-name-turn').textContent = `${p2.name} (${p2PrizesLeft} Prizes)`;
        }
    } else if (game.tcg === 'lorcana') {
        document.getElementById('pokemon-controls').classList.add('hidden');
        document.getElementById('lorcana-controls').classList.remove('hidden');
        if(me) renderLorcanaControls(me);
        if (p1Id && game.players[p1Id]) {
            const p1 = game.players[p1Id];
            document.getElementById('player1-name-turn').textContent = `${p1.name} (${p1.loreCount} Lore)`;
        }
        if (p2Id && game.players[p2Id]) {
            const p2 = game.players[p2Id];
            document.getElementById('player2-name-turn').textContent = `${p2.name} (${p2.loreCount} Lore)`;
        }
    }

    p1Indicator.classList.remove('turn-indicator-glow');
    p2Indicator.classList.remove('turn-indicator-glow');
    if (game.turn === p1Id) p1Indicator.classList.add('turn-indicator-glow');
    if (game.turn === p2Id) p2Indicator.classList.add('turn-indicator-glow');

    let statusText = "Waiting to start...";
    if (game.status === 'active') {
        statusText = "Game in progress!";
        if (game.gameMode === 'bestOfThree') {
            statusText = `Game ${game.currentGame} of 3`;
        }
    }
    if (game.status === 'overtime') {
        statusText = "Time expired! Last turns!";
    }
    if (game.status === 'paused') statusText = "Game Paused - Opponent Disconnected";
    if (game.status === 'finished' || game.status === 'game-over') {
        const winner = game.players[game.roundWinnerId] || game.players[game.winnerId];
        if (game.isTie) {
            statusText = "Round Tied!";
        } else if (winner) {
            statusText = `Game Over! ${winner.name} wins the round!`;
        } else {
            statusText = "Game Over!";
        }
    }
    document.getElementById('game-status-text').textContent = statusText;

    renderTimerDisplay();
    renderActionButtons();
}

function renderPrizeCards(me) {
    const prizeGrid = document.getElementById('prize-card-grid');
    prizeGrid.innerHTML = '';
    for (let i = 1; i <= appState.game.prizeCount; i++) {
        const card = document.createElement('button');
        card.dataset.prizeId = i;
        card.className = 'prize-card p-4 sm:p-6 rounded-lg font-bold text-2xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed';
        card.textContent = i;
        if (me.prizesTaken.includes(i)) card.classList.add('taken');
        card.disabled = appState.game.status !== 'active' && appState.game.status !== 'overtime';
        prizeGrid.appendChild(card);
    }
}

function renderLorcanaControls(me) {
    const loreTracker = document.getElementById('lore-tracker');
    loreTracker.innerHTML = `
        <button id="lore-up-btn" class="p-2 text-gray-400 hover:text-white"><i class="fas fa-arrow-up fa-3x"></i></button>
        <div class="my-2 flex items-center">
            ${loreIconSVG}
            <span id="lore-count" class="text-6xl font-bold ml-4">${me.loreCount}</span>
        </div>
        <button id="lore-down-btn" class="p-2 text-gray-400 hover:text-white"><i class="fas fa-arrow-down fa-3x"></i></button>
    `;
}

function renderTimerDisplay() {
    const timerDisplay = document.getElementById('timer-display-controls');
    if (!timerDisplay) return;

    const { timerType, timerState } = appState.game;
    let html = '';

    if (timerType === 'countdown') {
        const timeRemaining = (appState.game.countdownMinutes * 60 * 1000) - timerState.elapsed;
        html = `<p class="text-4xl font-bold tabular-nums">${formatTime(timeRemaining)}</p>`;
    } else {
        const p1Id = Object.keys(appState.game.players).find(id => appState.game.players[id].isHost);
        const p2Id = Object.keys(appState.game.players).find(id => !appState.game.players[id].isHost);
        const p1Time = timerState.playerTimes[p1Id] ?? (appState.game.chessMinutes * 60000);
        const p2Time = timerState.playerTimes[p2Id] ?? (appState.game.chessMinutes * 60000);
        html = `
            <div class="flex justify-around items-center text-3xl font-bold tabular-nums">
                <div>
                    <p class="text-sm">${p1Id && appState.game.players[p1Id] ? appState.game.players[p1Id].name : 'Host'}</p>
                    <p>${formatTime(p1Time)}</p>
                </div>
                <div>
                    <p class="text-sm">${p2Id && appState.game.players[p2Id] ? appState.game.players[p2Id].name : 'Guest'}</p>
                    <p>${formatTime(p2Time)}</p>
                </div>
            </div>`;
    }
    timerDisplay.innerHTML = html;
}

function renderActionButtons() {
    const controlsContainer = document.getElementById('turn-controls');
    controlsContainer.innerHTML = '';
    if (appState.game.status !== 'active' && appState.game.status !== 'overtime') return;

    const isMyTurn = appState.myId === appState.game.turn;

    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'flex items-center justify-center space-x-4';

    const endTurnBtn = document.createElement('button');
    endTurnBtn.id = 'end-turn-btn';
    endTurnBtn.className = 'flex-grow bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-xl shadow-lg transition-transform transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed';
    endTurnBtn.textContent = 'End Turn';
    endTurnBtn.disabled = !isMyTurn;

    const scoopBtn = document.createElement('button');
    scoopBtn.id = 'scoop-btn';
    scoopBtn.className = 'flex-shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg transition-transform transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed';
    scoopBtn.textContent = 'SCOOP!';
    scoopBtn.disabled = appState.game.status !== 'active' && appState.game.status !== 'overtime';

    buttonWrapper.appendChild(endTurnBtn);
    buttonWrapper.appendChild(scoopBtn);
    controlsContainer.appendChild(buttonWrapper);
}

function renderPresenter() {
    if (appState.view !== 'presenter') return;
    const { game } = appState;

    const p1Id = Object.keys(game.players).find(id => game.players[id].isHost);
    const p2Id = Object.keys(game.players).find(id => !game.players[id].isHost);

    const p1 = p1Id ? game.players[p1Id] : { name: 'Host', prizesTaken: [], loreCount: 0, color: '#cccccc', wins: 0 };
    const p2 = p2Id ? game.players[p2Id] : { name: 'Guest', prizesTaken: [], loreCount: 0, color: '#cccccc', wins: 0 };

    document.getElementById('presenter-p1-name').textContent = p1.name;
    document.getElementById('presenter-p2-name').textContent = p2.name;
    document.getElementById('presenter-room-code').textContent = appState.roomCode;

    const p1Avatar = document.getElementById('presenter-p1-avatar');
    p1Avatar.innerHTML = trainerSilhouetteSVG;
    p1Avatar.style.color = p1.color;
    p1Avatar.classList.toggle('turn-indicator-glow', game.turn === p1Id);

    const p2Avatar = document.getElementById('presenter-p2-avatar');
    p2Avatar.innerHTML = trainerSilhouetteSVG;
    p2Avatar.style.color = p2.color;
    p2Avatar.classList.toggle('turn-indicator-glow', game.turn === p2Id);

    if (game.gameMode === 'bestOfThree') {
        document.getElementById('presenter-game-number').textContent = `Game ${game.currentGame}`;
        document.getElementById('presenter-p1-wins').textContent = `${game.wins[p1Id] || 0} Wins`;
        document.getElementById('presenter-p2-wins').textContent = `${game.wins[p2Id] || 0} Wins`;
    } else {
        document.getElementById('presenter-game-number').textContent = '';
        document.getElementById('presenter-p1-wins').textContent = '';
        document.getElementById('presenter-p2-wins').textContent = '';
    }

    if (game.tcg === 'lorcana') {
        document.getElementById('presenter-p1-prizes').classList.add('hidden');
        document.getElementById('presenter-p2-prizes').classList.add('hidden');
        const p1Lore = document.getElementById('presenter-p1-lore');
        const p2Lore = document.getElementById('presenter-p2-lore');
        p1Lore.classList.remove('hidden');
        p2Lore.classList.remove('hidden');
        p1Lore.innerHTML = `${loreIconSVG} <span class="ml-2">${p1.loreCount} Lore</span>`;
        p2Lore.innerHTML = `${loreIconSVG} <span class="ml-2">${p2.loreCount} Lore</span>`;
    } else {
        document.getElementById('presenter-p1-prizes').classList.remove('hidden');
        document.getElementById('presenter-p2-prizes').classList.remove('hidden');
        document.getElementById('presenter-p1-lore').classList.add('hidden');
        document.getElementById('presenter-p2-lore').classList.add('hidden');
        renderPrizesInArc(p1, 'presenter-p1-prizes', true);
        renderPrizesInArc(p2, 'presenter-p2-prizes', false);
    }

    const countdownTimerEl = document.getElementById('presenter-timer');
    const chessTimersEl = document.getElementById('presenter-chess-timers');
    const p1ChessEl = document.getElementById('presenter-chess-p1');
    const p2ChessEl = document.getElementById('presenter-chess-p2');

    if (game.timerType === 'countdown') {
        countdownTimerEl.classList.remove('hidden');
        chessTimersEl.classList.add('hidden');
        const timeRemaining = (appState.game.countdownMinutes * 60 * 1000) - game.timerState.elapsed;
        countdownTimerEl.textContent = formatTime(timeRemaining);
    } else {
        countdownTimerEl.classList.add('hidden');
        chessTimersEl.classList.remove('hidden');
        const p1Time = game.timerState.playerTimes[p1Id] ?? (appState.game.chessMinutes * 60000);
        const p2Time = game.timerState.playerTimes[p2Id] ?? (appState.game.chessMinutes * 60000);
        p1ChessEl.textContent = formatTime(p1Time);
        p2ChessEl.textContent = formatTime(p2Time);
        p1ChessEl.style.color = p1.color;
        p2ChessEl.style.color = p2.color;
    }
}

function renderPrizesInArc(player, containerId, isReversed) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const numPrizes = appState.game.prizeCount;
    const radius = 220;
    const totalAngle = 150;
    const angleStep = numPrizes > 1 ? totalAngle / (numPrizes - 1) : 0;
    const startAngle = -75;

    for (let i = 1; i <= numPrizes; i++) {
        const angle = startAngle + (angleStep * (i - 1));
        const radians = angle * (Math.PI / 180);
        const x = radius * Math.cos(radians);
        const y = radius * Math.sin(radians);

        const prizeEl = document.createElement('div');
        prizeEl.className = 'presenter-prize-pokeball';
        prizeEl.style.transform = `translate(${isReversed ? -x : x}px, ${y}px)`;

        const taken = player.prizesTaken.includes(i);
        if (taken) prizeEl.classList.add('taken');
        container.appendChild(prizeEl);
    }
}

export function renderChooseFirstPlayerModal() {
    const optionsDiv = document.getElementById('first-player-options');
    optionsDiv.innerHTML = '';
    Object.values(appState.game.players).forEach(player => {
        if (!player.connected) return;
        const btn = document.createElement('button');
        btn.className = 'w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg text-xl';
        btn.textContent = player.name;
        btn.dataset.playerId = Object.keys(appState.game.players).find(id => appState.game.players[id] === player);
        optionsDiv.appendChild(btn);
    });
    showModal('chooseFirstPlayerModal');
}

export function renderIssueWinModal() {
    const optionsDiv = document.getElementById('issue-win-options');
    optionsDiv.innerHTML = '';
    Object.values(appState.game.players).forEach(player => {
        const btn = document.createElement('button');
        btn.className = 'w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg text-xl';
        btn.textContent = `Award Win to ${player.name}`;
        btn.dataset.playerId = Object.keys(appState.game.players).find(id => appState.game.players[id] === player);
        optionsDiv.appendChild(btn);
    });

    if (appState.game.timerType === 'countdown') {
        const tieBtn = document.createElement('button');
        tieBtn.className = 'w-full bg-gray-500 hover:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg text-xl mt-2';
        tieBtn.textContent = 'Declare a Tie';
        tieBtn.dataset.playerId = 'tie';
        optionsDiv.appendChild(tieBtn);
    }
    showModal('issueWinModal');
}

export function showWinnerAnimation(winner, isRoundWin = false, isTie = false) {
    const winnerTitle = document.getElementById('winner-title');
    const winnerName = document.getElementById('winner-name');

    if (isTie) {
        winnerTitle.textContent = "TIE!";
        winnerName.textContent = "The round results in a tie!";
    } else if (winner) {
        winnerTitle.textContent = isRoundWin ? "ROUND WINNER!" : "WINNER!";
        winnerName.textContent = isRoundWin ? `${winner.name} wins the round!` : winner.name;
    } else {
        return;
    }

    const buttonContainer = document.getElementById('winner-modal-buttons');
    buttonContainer.innerHTML = '';
    if (appState.isHost) {
        const btn = document.createElement('button');
        // If it's a round win in Bo3 and there's no overall winner yet
        if (appState.game.gameMode === 'bestOfThree' && appState.game.status === 'game-over') {
            btn.id = 'next-game-btn';
            btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded';
            btn.textContent = 'Next Game';
        } else { // Match is over
            btn.id = 'play-again-btn';
            btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded';
            btn.textContent = 'Play Again';
        }
        buttonContainer.appendChild(btn);
    } else {
        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-winner-btn';
        closeBtn.className = 'bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded';
        closeBtn.textContent = 'Close';
        buttonContainer.appendChild(closeBtn);
    }

    showModal('winnerModal');
    appState.game.winnerAnnounced = true;
}
