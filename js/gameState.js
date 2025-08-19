// /js/gameState.js

// --- STATE MANAGEMENT ---
// The single source of truth for the entire application.
export let appState = {
    pusher: null,
    channel: null,
    myId: null,
    isHost: false,
    roomCode: null,
    view: 'home', // home, tcgSelection, gameRoom, presenter
    playerName: `Player${Math.floor(Math.random() * 900 + 100)}`,
    game: {
        tcg: 'pokemon',
        status: 'waiting', // waiting, active, paused, finished, overtime, game-over
        prizeCount: 6,
        loreToWin: 20,
        timerType: 'countdown', // countdown, chess
        countdownMinutes: 30,
        chessMinutes: 20,
        gameMode: 'basic', // basic, bestOfThree
        currentGame: 1,
        wins: {}, // { [playerId]: winCount }
        roundWinnerId: null,
        isTie: false,
        winnerId: null,
        winnerAnnounced: false,
        players: {}, // { [id]: { name, prizesTaken: [], loreCount: 0, isHost, color, connected: true } }
        turn: null, // player id
        timerState: {
            running: false,
            startTime: null,
            elapsed: 0,
            playerTimes: {} // { [id]: timeInMillis }
        }
    },
};

// --- CORE GAME LOGIC ---

/**
 * Handles the logic for a player winning a game round.
 * @param {string} winnerId - The ID of the winning player.
 */
export function handleGameWin(winnerId) {
    if (!appState.isHost) return;

    appState.game.winnerId = winnerId;

    if (appState.game.gameMode === 'bestOfThree') {
        appState.game.wins[winnerId] = (appState.game.wins[winnerId] || 0) + 1;

        if (appState.game.wins[winnerId] >= 2) {
            appState.game.roundWinnerId = winnerId;
            appState.game.status = 'finished';
            appState.game.timerState.running = false;
        } else {
            appState.game.status = 'game-over'; 
        }
    } else {
        appState.game.roundWinnerId = winnerId;
        appState.game.status = 'finished';
        appState.game.timerState.running = false;
    }
    
    // Sound will be handled in the UI module
}

/**
 * Handles a player conceding the game.
 * @param {string} loserId - The ID of the player who scooped.
 */
export function handleScoop(loserId) {
    const winnerId = Object.keys(appState.game.players).find(id => id !== loserId);
    if (winnerId) {
        handleGameWin(winnerId);
    }
}

/**
 * Handles the host manually issuing a win to a player. This is a wrapper for handleGameWin.
 * @param {string} winnerId - The ID of the player to award the win to.
 */
export function handleIssueWin(winnerId) {
    if (!appState.isHost) return;
    handleGameWin(winnerId);
}

/**
 * Handles the host declaring a tie game.
 */
export function handleTie() {
    if (!appState.isHost) return;

    const pIds = Object.keys(appState.game.players);
    const p1Id = pIds.find(id => appState.game.players[id].isHost);
    const p2Id = pIds.find(id => !appState.game.players[id].isHost);
    
    if (p1Id && p2Id) {
        const p1Wins = appState.game.wins[p1Id] || 0;
        const p2Wins = appState.game.wins[p2Id] || 0;

        if (p1Wins > p2Wins) {
            appState.game.roundWinnerId = p1Id;
        } else if (p2Wins > p1Wins) {
            appState.game.roundWinnerId = p2Id;
        } else {
            appState.game.isTie = true;
        }
    } else {
        appState.game.isTie = true; // Default to tie if players are missing
    }


    appState.game.status = 'finished';
    appState.game.timerState.running = false;
}

/**
 * Resets the game state for a new round or match.
 */
export function restartRound() {
    Object.values(appState.game.players).forEach(p => {
        p.prizesTaken = [];
        p.loreCount = 0;
    });
    appState.game.status = 'waiting';
    appState.game.timerState = { running: false, startTime: null, elapsed: 0, playerTimes: {} };
    appState.game.wins = {};
    appState.game.currentGame = 1;
    appState.game.roundWinnerId = null;
    appState.game.isTie = false;
    appState.game.winnerId = null;
    appState.game.winnerAnnounced = false;
}

/**
 * Sets up the game state to start a new game.
 * @param {string} firstPlayerId - The ID of the player who will go first.
 * @param {boolean} isFirstGame - Whether this is the very first game of the match.
 */
export function startGameWithFirstPlayer(firstPlayerId, isFirstGame = true) {
    if (!appState.isHost) return;

    appState.game.status = 'active';
    appState.game.turn = firstPlayerId;
    appState.game.winnerAnnounced = false;
    appState.game.winnerId = null;
    appState.game.roundWinnerId = null;
    appState.game.isTie = false;

    if (isFirstGame) {
        appState.game.timerState.running = true;
        appState.game.timerState.startTime = Date.now();
        appState.game.timerState.elapsed = 0;
        
        Object.keys(appState.game.players).forEach(id => {
            appState.game.wins[id] = 0;
        });

        if (appState.game.timerType === 'chess') {
            Object.keys(appState.game.players).forEach(id => {
                appState.game.timerState.playerTimes[id] = appState.game.chessMinutes * 60 * 1000;
            });
        }
    } else {
        // Reset prizes/lore for the next game in a best-of-three match
        Object.values(appState.game.players).forEach(p => {
            p.prizesTaken = [];
            p.loreCount = 0;
        });
        appState.game.currentGame++;
    }
}
