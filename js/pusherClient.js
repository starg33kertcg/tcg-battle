// /js/pusherClient.js

import { appState, handleGameWin, handleScoop, handleTie, startGameWithFirstPlayer } from './gameState.js';
import { fullRender, playBuzzer } from './ui.js';

let PUSHER_APP_KEY = null;
let PUSHER_CLUSTER = null;
let timerInterval = null;

export async function initializePusher() {
    try {
        const response = await fetch('/.netlify/functions/pusher-config');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        const config = await response.json();
        PUSHER_APP_KEY = config.key;
        PUSHER_CLUSTER = config.cluster;
    } catch (error) {
        console.error("Could not fetch Pusher config:", error);
        alert("Error: Could not connect to the real-time server. Please try refreshing the page.");
        return false;
    }

    if (!PUSHER_APP_KEY || !PUSHER_CLUSTER) {
        console.error("Pusher key or cluster is missing from config.");
        return false;
    }

    appState.pusher = new Pusher(PUSHER_APP_KEY, {
        cluster: PUSHER_CLUSTER,
        authEndpoint: '/.netlify/functions/pusher-auth',
        auth: {
            params: {
                playerName: appState.playerName,
                isHost: appState.isHost
            }
        }
    });
    return true;
}

export function subscribeToChannel(roomCode) {
    appState.roomCode = roomCode;
    appState.channel = appState.pusher.subscribe(`presence-tcg-battle-${roomCode}`);
    bindChannelEvents();
}

export function broadcastGameState() {
    if (!appState.channel || !appState.isHost) return;
    try {
        localStorage.setItem(`tcgBattleState-${appState.roomCode}`, JSON.stringify(appState.game));
        appState.channel.trigger('client-state-update', appState.game);
    } catch (error) {
        console.error("Pusher trigger failed:", error);
    }
}

function bindChannelEvents() {
    appState.channel.bind('pusher:subscription_succeeded', (members) => {
        console.log('Subscribed to channel:', appState.roomCode);
        appState.myId = appState.channel.members.me.id;
        
        let wasDemoted = false;
        if (appState.isHost) {
            let anotherHostExists = false;
            members.each(member => {
                if (member.id !== appState.myId && member.info.isHost) {
                    anotherHostExists = true;
                }
            });

            if (anotherHostExists) {
                console.warn("Another host found. Demoting self to guest.");
                appState.isHost = false;
                wasDemoted = true;
                const sessionData = JSON.parse(sessionStorage.getItem('tcgBattleSession'));
                if (sessionData) {
                    sessionData.isHost = false;
                    sessionStorage.setItem('tcgBattleSession', JSON.stringify(sessionData));
                }
                fullRender();
            }
        }

        if (appState.isHost) {
            console.log("I am the host.");
            if (Object.keys(appState.game.players).length === 0) {
                appState.game.players[appState.myId] = { name: appState.playerName, prizesTaken: [], loreCount: 0, isHost: true, color: '#ef4444', connected: true };
            }
            
            if(appState.game.players[appState.myId]) {
                appState.game.players[appState.myId].connected = true;
            }

            broadcastGameState();
            fullRender();
            bindHostEvents();
        } else {
             console.log("I am a guest, waiting for host state...");
            if (!wasDemoted) {
                const roomCheckTimeout = setTimeout(() => {
                    let hostExists = false;
                    appState.channel.members.each(member => {
                        if (member.info.isHost) hostExists = true;
                    });
                    if (!hostExists) {
                        alert("Room not found or host has left. Returning to home.");
                        sessionStorage.removeItem('tcgBattleSession');
                        window.location.href = window.location.pathname;
                    }
                }, 3000);
                appState.roomCheckTimeout = roomCheckTimeout;
            }
        }
    });

    appState.channel.bind('pusher:member_added', (member) => {
        if (appState.isHost && member.id !== appState.myId) {
            console.log('Member added:', member.id);
            const returningPlayerEntry = Object.entries(appState.game.players).find(([id, player]) => player.name === member.info.playerName && !player.connected);

            if (returningPlayerEntry) {
                console.log('Player is reconnecting...');
                const [oldId, playerData] = returningPlayerEntry;
                delete appState.game.players[oldId];
                appState.game.players[member.id] = { ...playerData, connected: true, isHost: false };
                
                if (appState.game.timerType === 'chess') {
                    const oldTime = appState.game.timerState.playerTimes[oldId];
                    if (oldTime !== undefined) {
                        appState.game.timerState.playerTimes[member.id] = oldTime;
                        delete appState.game.timerState.playerTimes[oldId];
                    }
                }
                if (appState.game.turn === oldId) appState.game.turn = member.id;
                
                const allPlayersConnected = Object.values(appState.game.players).every(p => p.connected);
                if (allPlayersConnected && Object.keys(appState.game.players).length === 2) {
                    appState.game.status = 'active';
                    appState.game.timerState.running = true;
                    startTimer();
                }
            } else if (Object.keys(appState.game.players).length < 2) {
                console.log('New player is joining...');
                appState.game.players[member.id] = { name: member.info.playerName, prizesTaken: [], loreCount: 0, isHost: false, color: '#3b82f6', connected: true };
            } else {
                console.log("Spectator/Presenter joined. Not adding to game.");
            }
            broadcastGameState();
            fullRender();
        }
    });

    appState.channel.bind('pusher:member_removed', (member) => {
        if (appState.isHost) {
            console.log('Host saw member removed:', member.id);
            const player = appState.game.players[member.id];
            if (player) {
                player.connected = false;
                appState.game.status = 'paused';
                appState.game.timerState.running = false;
                broadcastGameState();
                fullRender();
            }
        } else {
            const removedPlayer = appState.game.players[member.id];
            if (removedPlayer && removedPlayer.isHost) {
                console.log("Host disconnected. Guest is becoming the new host.");
                appState.isHost = true;
                
                const sessionData = JSON.parse(sessionStorage.getItem('tcgBattleSession'));
                if (sessionData) {
                    sessionData.isHost = true;
                    sessionStorage.setItem('tcgBattleSession', JSON.stringify(sessionData));
                }
                
                const myPlayerData = appState.game.players[appState.myId];
                if(myPlayerData) {
                    myPlayerData.isHost = true;
                    myPlayerData.connected = true;
                }
                removedPlayer.connected = false;
                appState.game.status = 'paused';
                appState.game.timerState.running = false;
                
                broadcastGameState();
                fullRender();
                bindHostEvents();
            }
        }
    });

    appState.channel.bind('client-state-update', (data) => {
        if (!appState.isHost) {
            if (appState.roomCheckTimeout) {
                clearTimeout(appState.roomCheckTimeout);
                appState.roomCheckTimeout = null;
            }
            appState.game = data;
            if (!appState.game.timerState.running && timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            fullRender();
        }
    });

    appState.channel.bind('client-session-ended', () => {
        sessionStorage.removeItem('tcgBattleSession');
        localStorage.removeItem(`tcgBattleState-${appState.roomCode}`);
        alert('The host has ended the session.');
        window.location.href = window.location.pathname;
    });
}

function bindHostEvents() {
    if (!appState.channel) return;
    appState.channel.unbind_all(); // Clear old bindings before re-binding
    bindChannelEvents(); // Re-apply general bindings

    appState.channel.bind('client-update-prizes', (data, metadata) => {
        const playerId = metadata.user_id;
        if (appState.game.players[playerId]) {
            appState.game.players[playerId].prizesTaken = data.prizes;
            if (data.prizes.length >= appState.game.prizeCount) {
                handleGameWin(playerId);
            }
            broadcastGameState();
            fullRender();
        }
    });

    appState.channel.bind('client-update-lore', (data, metadata) => {
        const playerId = metadata.user_id;
        if (appState.game.players[playerId]) {
            appState.game.players[playerId].loreCount = data.loreCount;
            if (data.loreCount >= appState.game.loreToWin) {
                handleGameWin(playerId);
            }
            broadcastGameState();
            fullRender();
        }
    });

    appState.channel.bind('client-end-turn', (data, metadata) => {
        const playerId = metadata.user_id;
        if (appState.game.turn === playerId) {
            appState.game.turn = data.turn;
            broadcastGameState();
            fullRender();
        }
    });

    appState.channel.bind('client-scoop-game', (data, metadata) => {
        handleScoop(metadata.user_id);
        broadcastGameState();
        fullRender();
    });

    console.log("Host events bound.");
}

export function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (!appState.game.timerState.running || !appState.isHost) return;

    let lastTick = Date.now();
    timerInterval = setInterval(() => {
        if (!appState.game.timerState.running) {
            clearInterval(timerInterval);
            timerInterval = null;
            return;
        }
        const delta = Date.now() - lastTick;
        lastTick = Date.now();
        
        const { timerType } = appState.game;
        let timeIsUp = false;

        if (timerType === 'countdown') {
            appState.game.timerState.elapsed += delta;
            if ((appState.game.countdownMinutes * 60 * 1000) - appState.game.timerState.elapsed < 1) {
                timeIsUp = true;
                appState.game.timerState.elapsed = appState.game.countdownMinutes * 60 * 1000;
            }
        } else { // chess
            const { turn } = appState.game;
            if (turn && appState.game.timerState.playerTimes[turn]) {
                appState.game.timerState.playerTimes[turn] -= delta;
                if (appState.game.timerState.playerTimes[turn] <= 0) {
                    appState.game.timerState.playerTimes[turn] = 0;
                    timeIsUp = true;
                }
            }
        }
        
        if (timeIsUp) {
            clearInterval(timerInterval);
            timerInterval = null;
            appState.game.timerState.running = false;
            playBuzzer();

            if (timerType === 'countdown') {
                appState.game.status = 'overtime';
            } else { // Chess clock timeout
                const loserId = appState.game.turn;
                handleGameWin(Object.keys(appState.game.players).find(id => id !== loserId));
            }
        }
        
        broadcastGameState();
        fullRender();
    }, 1000);
}
