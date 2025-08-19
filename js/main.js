// /js/main.js

import { appState, restartRound, startGameWithFirstPlayer, handleTie, handleScoop, handleIssueWin } from './gameState.js';
import { showView, showModal, hideModal, fullRender, renderChooseFirstPlayerModal, renderIssueWinModal, setupGameSettings } from './ui.js';
import { initializePusher, subscribeToChannel, broadcastGameState, startTimer } from './pusherClient.js';

// --- INITIALIZATION ---
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const presenterCode = urlParams.get('presenter');
    const roomToJoin = urlParams.get('join');
    const savedSession = sessionStorage.getItem('tcgBattleSession');

    // Don't initialize pusher if we are just on the homepage with no session
    if (!presenterCode && !savedSession) {
        showView('home');
        addEventListeners();
        if (roomToJoin) {
            document.getElementById('room-code-input').value = roomToJoin;
            showModal('joinSessionModal');
        }
        return;
    }
    
    let initialGameSettings = null;
    // If there is a session or presenter code, load basic session data first
    if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        appState.roomCode = sessionData.roomCode;
        appState.isHost = sessionData.isHost;
        appState.playerName = sessionData.playerName;
        initialGameSettings = sessionData.game; // Get initial settings here
    } else if (presenterCode) {
        appState.isHost = false;
        appState.myId = `presenter_${Date.now()}`;
    }

    const pusherReady = await initializePusher();
    if (!pusherReady) return;

    if (presenterCode) {
        subscribeToChannel(presenterCode, null); // Presenter doesn't need initial settings
        showView('presenter');
    } else if (savedSession) {
        subscribeToChannel(appState.roomCode, initialGameSettings);
        showView(JSON.parse(savedSession).view);
    }
    
    addEventListeners();
}

// --- EVENT HANDLERS ---
function addEventListeners() {
    document.getElementById('create-session-btn').addEventListener('click', () => showView('tcgSelection'));
    
    document.getElementById('join-session-btn').addEventListener('click', () => {
        document.getElementById('join-player-name').value = appState.playerName;
        showModal('joinSessionModal');
    });

    document.getElementById('back-to-home-from-tcg').addEventListener('click', () => showView('home'));
    
    document.getElementById('select-pokemon').addEventListener('click', () => setupGameSettings('pokemon'));
    document.getElementById('select-lorcana').addEventListener('click', () => setupGameSettings('lorcana'));

    document.querySelectorAll('.prize-option-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.prize-option-btn').forEach(b => b.classList.replace('bg-blue-600', 'bg-gray-600'));
        btn.classList.replace('bg-gray-600', 'bg-blue-600');
    }));
    
    document.querySelectorAll('.timer-type-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.timer-type-btn').forEach(b => b.classList.replace('bg-blue-600', 'bg-gray-600'));
        btn.classList.replace('bg-gray-600', 'bg-blue-600');
        
        const isCountdown = btn.dataset.timer === 'countdown';
        document.getElementById('countdown-timer-settings').style.display = isCountdown ? 'block' : 'none';
        document.getElementById('number-of-games-settings').style.display = isCountdown ? 'block' : 'none';
        document.getElementById('chess-timer-settings').style.display = isCountdown ? 'none' : 'block';
        
        if (!isCountdown) {
            // Visually reset the game mode buttons to 'Basic Swiss'
            document.querySelector('.game-mode-btn[data-mode="basic"]').classList.replace('bg-gray-600', 'bg-blue-600');
            document.querySelector('.game-mode-btn[data-mode="bestOfThree"]').classList.replace('bg-blue-600', 'bg-gray-600');
        }
    }));

    document.querySelectorAll('.game-mode-btn').forEach(btn => btn.addEventListener('click', () => {
        const selectedTimerType = document.querySelector('.timer-type-btn.bg-blue-600').dataset.timer;
        if (selectedTimerType === 'countdown') {
            document.querySelectorAll('.game-mode-btn').forEach(b => b.classList.replace('bg-blue-600', 'bg-gray-600'));
            btn.classList.replace('bg-gray-600', 'bg-blue-600');
        }
    }));

    document.getElementById('cancel-settings-btn').addEventListener('click', () => hideModal('gameSettingsModal'));
    document.getElementById('cancel-join-btn').addEventListener('click', () => hideModal('joinSessionModal'));

    document.getElementById('confirm-create-btn').addEventListener('click', () => {
        // Build a fresh game settings object directly from the UI to ensure accuracy
        const finalGameSettings = {
            ...appState.game, // Start with defaults
            tcg: appState.game.tcg,
            status: 'waiting',
            prizeCount: parseInt(document.querySelector('.prize-option-btn.bg-blue-600').dataset.prizes, 10),
            loreToWin: parseInt(document.getElementById('lore-to-win-input').value, 10),
            timerType: document.querySelector('.timer-type-btn.bg-blue-600').dataset.timer,
            countdownMinutes: parseInt(document.getElementById('countdown-minutes').value, 10),
            chessMinutes: parseInt(document.getElementById('chess-minutes').value, 10),
            gameMode: document.querySelector('.game-mode-btn.bg-blue-600').dataset.mode,
            players: {},
            turn: null,
            timerState: { running: false, startTime: null, elapsed: 0, playerTimes: {} }
        };
        
        if (finalGameSettings.timerType === 'chess') {
            finalGameSettings.gameMode = 'basic';
        }

        const sessionData = {
            roomCode: Math.floor(10000 + Math.random() * 90000).toString(),
            isHost: true,
            playerName: document.getElementById('player-name-input').value || appState.playerName,
            view: 'gameRoom',
            game: finalGameSettings // Use the fresh settings object
        };
        
        sessionStorage.setItem('tcgBattleSession', JSON.stringify(sessionData));
        window.location.reload();
    });

    document.getElementById('confirm-join-btn').addEventListener('click', () => {
        const roomCode = document.getElementById('room-code-input').value;
        const playerName = document.getElementById('join-player-name').value;
        if (!roomCode || roomCode.length !== 5 || !playerName) {
            alert('Please enter a valid name and 5-digit room code.');
            return;
        }
        const sessionData = {
            roomCode: roomCode,
            isHost: false,
            playerName: playerName,
            view: 'gameRoom'
        };
        sessionStorage.setItem('tcgBattleSession', JSON.stringify(sessionData));
        window.location.reload();
    });

    document.getElementById('prize-card-grid').addEventListener('click', (e) => {
        if (e.target.classList.contains('prize-card') && (appState.game.status === 'active' || appState.game.status === 'overtime')) {
            const prizeId = parseInt(e.target.dataset.prizeId);
            const myPlayer = appState.game.players[appState.myId];
            if (!myPlayer) return;
            
            const myPrizes = myPlayer.prizesTaken;
            if (myPrizes.includes(prizeId)) {
                myPrizes.splice(myPrizes.indexOf(prizeId), 1);
            } else {
                myPrizes.push(prizeId);
            }
            
            if (appState.isHost) {
                if (myPrizes.length >= appState.game.prizeCount) {
                    handleGameWin(appState.myId);
                }
                broadcastGameState();
                fullRender();
            } else {
                appState.channel.trigger('client-update-prizes', { prizes: myPrizes });
            }
        }
    });

    document.getElementById('game-menu-dropdown').addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = e.target.id;
    
        if (targetId === 'start-game-btn') {
            const connectedPlayers = Object.values(appState.game.players).filter(p => p.connected);
            if (connectedPlayers.length < 2) {
                alert("Cannot start, waiting for a guest to join.");
                return;
            }
            renderChooseFirstPlayerModal();
        } else if (targetId === 'restart-round-btn') {
            restartRound();
            broadcastGameState();
            fullRender();
        } else if (targetId === 'issue-win-btn') {
            renderIssueWinModal();
        } else if (targetId === 'end-session-btn') {
            if (confirm('Are you sure you want to end this session for everyone?')) {
                appState.channel.trigger('client-session-ended', {});
                setTimeout(() => {
                    sessionStorage.removeItem('tcgBattleSession');
                    localStorage.removeItem(`tcgBattleState-${appState.roomCode}`);
                    window.location.href = window.location.pathname;
                }, 500);
            }
        } else if (targetId === 'leave-battle-btn') {
            sessionStorage.removeItem('tcgBattleSession');
            window.location.href = window.location.pathname;
        } else if (targetId === 'open-presenter-btn') {
            const presenterUrl = `${window.location.origin}${window.location.pathname}?presenter=${appState.roomCode}`;
            window.open(presenterUrl, '_blank');
        }
    
        document.getElementById('game-menu-dropdown').classList.add('hidden');
    });

    document.getElementById('game-menu-btn').addEventListener('click', () => {
        document.getElementById('game-menu-dropdown').classList.toggle('hidden');
    });

    document.getElementById('first-player-options').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const firstPlayerId = e.target.dataset.playerId;
            hideModal('chooseFirstPlayerModal');
            startGameWithFirstPlayer(firstPlayerId, appState.game.status === 'waiting');
            startTimer();
            broadcastGameState();
            fullRender();
        }
    });

    document.getElementById('issue-win-options').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const winnerId = e.target.dataset.playerId;
            hideModal('issueWinModal');
            if (winnerId === 'tie') {
                handleTie();
            } else {
                handleIssueWin(winnerId);
            }
            broadcastGameState();
            fullRender();
        }
    });
    
    document.getElementById('cancel-issue-win-btn').addEventListener('click', () => hideModal('issueWinModal'));

    document.getElementById('winner-modal-buttons').addEventListener('click', (e) => {
        if (e.target.id === 'play-again-btn' && appState.isHost) {
            hideModal('winnerModal');
            restartRound();
            broadcastGameState();
            fullRender();
        } else if (e.target.id === 'next-game-btn' && appState.isHost) {
            hideModal('winnerModal');
            renderChooseFirstPlayerModal();
        } else if (e.target.id === 'close-winner-btn') {
            hideModal('winnerModal');
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.closest('#lore-up-btn')) {
            const myPlayer = appState.game.players[appState.myId];
            myPlayer.loreCount++;
            if (appState.isHost) {
                if (myPlayer.loreCount >= appState.game.loreToWin) {
                    handleGameWin(appState.myId);
                }
                broadcastGameState();
                fullRender();
            } else {
                appState.channel.trigger('client-update-lore', { loreCount: myPlayer.loreCount });
            }
        }
        if (e.target.closest('#lore-down-btn')) {
            const myPlayer = appState.game.players[appState.myId];
            if (myPlayer.loreCount > 0) {
                myPlayer.loreCount--;
                if (appState.isHost) {
                    broadcastGameState();
                    fullRender();
                } else {
                    appState.channel.trigger('client-update-lore', { loreCount: myPlayer.loreCount });
                }
            }
        }
        if (e.target.id === 'end-turn-btn') {
            const otherPlayerId = Object.keys(appState.game.players).find(id => id !== appState.myId);
            if (appState.isHost) {
                appState.game.turn = otherPlayerId;
                broadcastGameState();
                fullRender();
            } else {
                appState.channel.trigger('client-end-turn', { turn: otherPlayerId });
            }
        }
        if (e.target.id === 'scoop-btn') {
            if(confirm('Are you sure you want to scoop? This will award the win to your opponent.')) {
                if (appState.isHost) {
                    handleScoop(appState.myId);
                    broadcastGameState();
                    fullRender();
                } else {
                    appState.channel.trigger('client-scoop-game', {});
                }
            }
        }
    });

    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`));
        } else {
            document.exitFullscreen();
        }
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
