const chatHud = document.getElementById('chatHud');
const chatHistory = document.getElementById('chatHistory');
const chatInputContainer = document.getElementById('chatInputContainer');
const chatInput = document.getElementById('chatInput');
const gameClockEl = document.getElementById('gameClock');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');

// Controls
const statsBtn = document.getElementById('statsBtn');
const statsModal = document.getElementById('statsModal');
const closeStatsModal = document.getElementById('closeStatsModal');
const statTotalScore = document.getElementById('statTotalScore');
const statHighestStreak = document.getElementById('statHighestStreak');
const statFlashesCaught = document.getElementById('statFlashesCaught');
const statSessionsPlayed = document.getElementById('statSessionsPlayed');

const infoBtn = document.getElementById('infoBtn');
const triggerBtn = document.getElementById('triggerBtn');
const resetBtn = document.getElementById('resetBtn');
const infoModal = document.getElementById('infoModal');
const closeModal = document.getElementById('closeModal');

// Gamification UI
const scoreBoard = document.getElementById('scoreBoard');
const scoreVal = document.getElementById('scoreVal');
const accuracyBoard = document.getElementById('accuracyBoard');
const streakVal = document.getElementById('streakVal');
const clockSpeedSelect = document.getElementById('clockSpeed');
const flashFreqSelect = document.getElementById('flashFreq');
const hardcoreModeCheckbox = document.getElementById('hardcoreMode');
const teamfightModeCheckbox = document.getElementById('teamfightMode');
const distractionModeCheckbox = document.getElementById('distractionMode');
const soundModeCheckbox = document.getElementById('soundMode');

// WebAudio: lazy-init on first user gesture (browsers block autoplay).
let audioCtx = null;
function ensureAudio() {
    if (!soundModeCheckbox.checked) return null;
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
    }
    return audioCtx;
}
function playTone(freq, durationMs, type = 'sine', gain = 0.06) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g).connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
}
function soundFlashSpawn() { playTone(660, 90, 'triangle', 0.05); }
function soundCatch(streakLevel) {
    // Pitch climbs slightly with streak, capped.
    const base = 880 + Math.min(streakLevel, 10) * 40;
    playTone(base, 110, 'sine', 0.07);
    setTimeout(() => playTone(base * 1.5, 90, 'sine', 0.05), 60);
}
function soundMiss() {
    playTone(220, 180, 'sawtooth', 0.05);
    setTimeout(() => playTone(160, 220, 'sawtooth', 0.04), 90);
}

// Local Storage Stats
let stats = JSON.parse(localStorage.getItem('flashTimerStats')) || {
    totalScore: 0,
    highestStreak: 0,
    flashesCaught: 0,
    sessionsPlayed: 0,
    sessions: []
};
if (!Array.isArray(stats.sessions)) stats.sessions = [];

function saveStats() {
    localStorage.setItem('flashTimerStats', JSON.stringify(stats));
}

function updateStatsModal() {
    statTotalScore.textContent = stats.totalScore;
    statHighestStreak.textContent = stats.highestStreak;
    statFlashesCaught.textContent = stats.flashesCaught;
    statSessionsPlayed.textContent = stats.sessionsPlayed;
    renderSessionChart();
}

function renderSessionChart() {
    const svg = document.getElementById('statChart');
    const empty = document.getElementById('statChartEmpty');
    if (!svg) return;

    const data = stats.sessions.slice(-20);
    if (data.length === 0) {
        svg.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    svg.style.display = 'block';
    empty.style.display = 'none';

    const W = 300, H = 100, pad = 6;
    const maxScore = Math.max(...data.map(s => s.score), 1);
    const n = data.length;
    const xAt = i => n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1);
    const yAt = v => H - pad - (v / maxScore) * (H - 2 * pad);

    const linePts = data.map((s, i) => `${xAt(i)},${yAt(s.score)}`).join(' ');
    const areaPts = `${pad},${H - pad} ${linePts} ${W - pad},${H - pad}`;
    const lastX = xAt(n - 1), lastY = yAt(data[n - 1].score);

    svg.innerHTML = `
        <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#c8aa6e" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#c8aa6e" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <polygon points="${areaPts}" fill="url(#chartFill)"/>
        <polyline points="${linePts}" fill="none" stroke="#c8aa6e" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        <circle cx="${lastX}" cy="${lastY}" r="2.5" fill="#5bc0eb"/>
    `;
}

let isChatActive = false;
let bubbleTimeout = null;
let bubblesBanked = 0;
const BUBBLE_BANK_MAX = Infinity;
const BUBBLE_BANK_PER_STACK = 0.2;
let gameTimeSeconds = 0;
let clockInterval = null;
let scenarioTimeout = null;
let distractionInterval = null;
let isPracticing = false;

// Gamification State
let score = 0;
let streak = 0;
let sessionBest = 0;
let sessionCatches = 0;
let sessionMisses = 0;
let sessionBestStreak = 0;
let sessionEndTime = 0; // real-time ms, 0 = unlimited
let sessionLengthSec = 0;
let expectedFlashes = {}; // e.g. { 'mid': { active: true, time: 860, flashTime: 560 } }

const RANK_TIERS = [
    { min: 0,  name: 'Unranked', color: '#7a7a7a', icon: '◇' },
    { min: 1,  name: 'Iron',     color: '#7a6b5c', icon: '◆' },
    { min: 3,  name: 'Bronze',   color: '#b08050', icon: '◆' },
    { min: 5,  name: 'Silver',   color: '#c0c0c0', icon: '◆' },
    { min: 8,  name: 'Gold',     color: '#c8aa6e', icon: '★' },
    { min: 12, name: 'Platinum', color: '#5bc0eb', icon: '★' },
    { min: 17, name: 'Diamond',  color: '#b58bf5', icon: '✦' },
    { min: 25, name: 'Master',   color: '#ff4f6d', icon: '✦' }
];
function getRank(s) {
    let r = RANK_TIERS[0];
    for (const tier of RANK_TIERS) if (s >= tier.min) r = tier;
    return r;
}

// LoL-flavored announcer callouts. Pools per streak tier, random pick.
const CALLOUTS = {
    tracked:     ['TRACKED', 'LOGGED', 'NOTED', 'ON TIMER', 'COUNTED'],
    double:      ['DOUBLE CATCH', 'BACK TO BACK', 'TWO DOWN'],
    spree:       ['KILLING SPREE', 'LOCKED IN', 'DIALED IN', 'ON FIRE'],
    rampage:     ['RAMPAGE', 'IN CONTROL', 'SHOTCALLER'],
    dominating:  ['DOMINATING', 'CARRYING', 'FULL TEMPO'],
    unstoppable: ['UNSTOPPABLE', 'RELENTLESS'],
    godlike:     ['GODLIKE', 'APEX'],
    legendary:   ['LEGENDARY', 'CHALLENGER']
};
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function getCatchCallout(s) {
    if (s >= 25) return pick(CALLOUTS.legendary);
    if (s >= 17) return pick(CALLOUTS.godlike);
    if (s >= 12) return pick(CALLOUTS.unstoppable);
    if (s >= 8)  return pick(CALLOUTS.dominating);
    if (s >= 5)  return pick(CALLOUTS.rampage);
    if (s >= 3)  return pick(CALLOUTS.spree);
    if (s >= 2)  return pick(CALLOUTS.double);
    return pick(CALLOUTS.tracked);
}

// Miss sub-text variants — shown in the soft red toast.
const MISS_SUBS = [
    'was up at <b>{T}</b> — streak broken',
    'slipped through — <b>{T}</b>',
    'too slow — <b>{T}</b>',
    'forgot this one — <b>{T}</b>',
    '<b>{T}</b> — watch the tracker',
    'missed the window — <b>{T}</b>',
    '<b>{T}</b> — streak reset',
    'off by a beat — <b>{T}</b>'
];
function getMissSub(timeStr) {
    return pick(MISS_SUBS).replace('{T}', timeStr);
}

const roles = ['Top', 'Jgl', 'Mid', 'Adc', 'Sup'];

// Helper to format time (MM:SS)
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Show animated floating text
let activeFloatingTexts = 0;

function showFloatingText(text, color) {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = text;
    el.style.color = color;
    
    // Stagger vertically if multiple texts appear at once
    el.style.marginTop = `${activeFloatingTexts * 45}px`;
    activeFloatingTexts++;
    
    document.body.appendChild(el);
    
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
        activeFloatingTexts--;
        if (activeFloatingTexts < 0) activeFloatingTexts = 0;
    }, 1500);
}

// Update gamification UI
const scoreNextEl = document.getElementById('scoreNext');
const scoreBestEl = document.getElementById('scoreBest');
const rankBadge = document.getElementById('rankBadge');
const rankIcon = document.getElementById('rankIcon');
const rankTier = document.getElementById('rankTier');
const flashTracker = document.getElementById('flashTracker');
const sessionLengthSelect = document.getElementById('sessionLength');
const sessionTimerEl = document.getElementById('sessionTimer');
const sessionTimerFill = document.getElementById('sessionTimerFill');
const resultsModal = document.getElementById('resultsModal');
const resFinalScore = document.getElementById('resFinalScore');
const resAccuracy = document.getElementById('resAccuracy');
const resBestStreak = document.getElementById('resBestStreak');
const resCaught = document.getElementById('resCaught');
const resNewBest = document.getElementById('resNewBest');
const resultsContinueBtn = document.getElementById('resultsContinueBtn');

function bubbleBankMult() { return 1 + bubblesBanked * BUBBLE_BANK_PER_STACK; }
function nextCatchPoints() { return Math.round((100 + streak * 20) * bubbleBankMult()); }

function updateScoreUI(prevStreak = streak) {
    scoreVal.textContent = score;
    streakVal.textContent = streak;
    const totalMult = (1 + streak * 0.2) * bubbleBankMult();
    const bankIndicator = bubblesBanked > 0 ? ` 🫧×${bubblesBanked}` : '';
    scoreNextEl.textContent = `+${nextCatchPoints()} ×${totalMult.toFixed(1)}${bankIndicator}`;

    if (score > sessionBest) sessionBest = score;
    scoreBestEl.textContent = sessionBest;

    const rank = getRank(streak);
    rankIcon.textContent = rank.icon;
    rankTier.textContent = rank.name;
    rankBadge.style.setProperty('--rank-color', rank.color);

    if (prevStreak > 0 && streak === 0) {
        rankBadge.classList.remove('streak-break');
        void rankBadge.offsetWidth;
        rankBadge.classList.add('streak-break');
    }
}

function showMissNotification(role, missedTime) {
    const card = document.createElement('div');
    card.className = 'miss-toast';
    card.innerHTML = `
        <div class="miss-toast-icon">✕</div>
        <div class="miss-toast-body">
            <div class="miss-toast-title">MISSED ${role.toUpperCase()}</div>
            <div class="miss-toast-sub">${getMissSub(missedTime)}</div>
        </div>`;
    document.body.appendChild(card);
    setTimeout(() => card.classList.add('leaving'), 1800);
    setTimeout(() => card.remove(), 2200);
}

let chatBlockedToast = null;
function showChatBlockedNotification() {
    if (chatBlockedToast) return; // dedupe rapid Enter presses
    const card = document.createElement('div');
    card.className = 'miss-toast';
    card.innerHTML = `
        <div class="miss-toast-icon">!</div>
        <div class="miss-toast-body">
            <div class="miss-toast-title">NO ACTIVE FLASH</div>
            <div class="miss-toast-sub">wait for an enemy to flash before logging</div>
        </div>`;
    document.body.appendChild(card);
    chatBlockedToast = card;
    setTimeout(() => card.classList.add('leaving'), 1400);
    setTimeout(() => {
        card.remove();
        if (chatBlockedToast === card) chatBlockedToast = null;
    }, 1800);
}

function pulseScore() {
    scoreVal.classList.remove('score-pulse');
    void scoreVal.offsetWidth;
    scoreVal.classList.add('score-pulse');
}

function renderFlashTracker() {
    if (!flashTracker) return;
    const windowMs = getCatchWindowMs();
    const now = Date.now();
    const activeRoles = new Set(
        Object.entries(expectedFlashes)
            .filter(([, f]) => f.active)
            .map(([role]) => role)
    );

    // Remove cards whose role is no longer active
    flashTracker.querySelectorAll('.flash-card').forEach(card => {
        if (!activeRoles.has(card.dataset.role)) card.remove();
    });

    // Create or update a card per active role
    for (const role of activeRoles) {
        const f = expectedFlashes[role];
        const remainingMs = Math.max(0, windowMs - (now - f.realTimeSpawn));
        const remaining = Math.ceil(remainingMs / 1000);
        const pct = Math.max(0, Math.min(100, (remainingMs / windowMs) * 100));
        const urgent = remainingMs <= windowMs * 0.33;

        let card = flashTracker.querySelector(`.flash-card[data-role="${role}"]`);
        if (!card) {
            card = document.createElement('div');
            card.className = 'flash-card';
            card.dataset.role = role;
            card.innerHTML = `
                <div class="flash-card-head">
                    <span class="flash-card-role">${role.toUpperCase()}</span>
                    <span class="flash-card-time"></span>
                </div>
                <div class="flash-card-bar"><div class="flash-card-fill"></div></div>`;
            flashTracker.appendChild(card);
        }
        card.classList.toggle('urgent', urgent);
        card.querySelector('.flash-card-time').textContent = `${remaining}s`;
        card.querySelector('.flash-card-fill').style.width = `${pct}%`;
    }
}

// Update clock
function getCatchWindowMs() {
    // Window is tied to flash frequency, not clock speed: harder pacing =
    // tighter typing budget, while remaining stable across clock speeds.
    switch (flashFreqSelect.value) {
        case 'insane': return 5000;
        case 'high':   return 10000;
        case 'low':    return 20000;
        default:       return 15000; // medium
    }
}

// Past ~45:00, a flash logged with +5min wraps past the 4-digit mmss format
// (e.g. 46:00 → expected 51:00). Soft-reset the in-game clock to a fresh
// early-game window once outstanding flashes are resolved.
const GAME_TIME_RESET_AT = 45 * 60;
function maybeResetGameClock() {
    if (gameTimeSeconds < GAME_TIME_RESET_AT) return;
    const anyActive = Object.values(expectedFlashes).some(f => f.active);
    if (anyActive) return;
    expectedFlashes = {};
    gameTimeSeconds = Math.floor(Math.random() * 360) + 120;
    chatHistory.innerHTML = '';
    const sysMsg = document.createElement('div');
    sysMsg.className = 'chat-message';
    sysMsg.innerHTML = `<span style="color:#c8aa6e;">— New game started —</span>`;
    chatHistory.appendChild(sysMsg);
}

function updateClock() {
    gameTimeSeconds += 1;
    maybeResetGameClock();
    gameClockEl.textContent = formatTime(gameTimeSeconds);

    const windowMs = getCatchWindowMs();
    const now = Date.now();
    for (const role in expectedFlashes) {
        const f = expectedFlashes[role];
        if (f.active && now - f.realTimeSpawn > windowMs) {
            f.active = false;
            sessionMisses++;
            const prevStreak = streak;
            streak = Math.max(0, streak - 1);
            score = Math.max(0, score - 50);
            if (bubblesBanked > 0) bubblesBanked--;
            showMissNotification(role, formatTime(f.time));
            soundMiss();
            updateScoreUI(prevStreak);
        }
    }
    renderFlashTracker();
    updateSessionTimer();
}

function updateSessionTimer() {
    if (!sessionEndTime) return;
    const totalMs = sessionLengthSec * 1000;
    const remainingMs = sessionEndTime - Date.now();
    if (remainingMs <= 0) {
        sessionTimerFill.style.width = '0%';
        endSession(false);
        return;
    }
    const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
    sessionTimerFill.style.width = `${pct}%`;
    sessionTimerEl.classList.toggle('warn', remainingMs <= 30000 && remainingMs > 10000);
    sessionTimerEl.classList.toggle('danger', remainingMs <= 10000);
}

function endSession(userAborted) {
    if (!isPracticing) return;
    isPracticing = false;

    if (clockInterval) clearInterval(clockInterval);
    if (scenarioTimeout) clearTimeout(scenarioTimeout);
    if (distractionInterval) clearTimeout(distractionInterval);
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    clearBubbles();

    scoreBoard.style.display = 'none';
    accuracyBoard.style.display = 'none';
    triggerBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    sessionTimerEl.style.display = 'none';
    flashTracker.innerHTML = '';

    if (isChatActive) {
        isChatActive = false;
        chatHud.classList.remove('active');
        chatInput.value = '';
        chatInput.blur();
    }

    // Record session if anything happened
    const played = sessionCatches + sessionMisses;
    let isNewBest = false;
    if (played > 0) {
        const prevBest = stats.sessions.reduce((m, s) => Math.max(m, s.score || 0), 0);
        isNewBest = score > prevBest;
        stats.sessions.push({
            ts: Date.now(),
            score,
            caught: sessionCatches,
            missed: sessionMisses,
            bestStreak: sessionBestStreak
        });
        if (stats.sessions.length > 50) stats.sessions = stats.sessions.slice(-50);
        stats.sessionsPlayed++;
        saveStats();
    }

    // Populate results
    const total = sessionCatches + sessionMisses;
    const acc = total > 0 ? Math.round((sessionCatches / total) * 100) : 0;
    resFinalScore.textContent = score;
    resAccuracy.textContent = total > 0 ? `${acc}%` : '—';
    resBestStreak.textContent = sessionBestStreak;
    resCaught.textContent = `${sessionCatches} / ${total}`;
    resNewBest.style.display = isNewBest ? 'inline' : 'none';
    document.getElementById('resultsTitle').textContent =
        userAborted ? 'Session Ended' : 'Session Complete';
    resultsModal.style.display = 'block';
}
// --- Bubble minigame: pops while no flash is active, banks a multiplier
// stack consumed by the next catch. Pauses (and clears) the moment a flash
// spawns so the user's attention snaps back to the timer task.
function anyFlashActive() {
    return Object.values(expectedFlashes).some(f => f.active);
}
function clearBubbles() {
    document.querySelectorAll('.bubble').forEach(b => b.remove());
}
function scheduleNextBubble() {
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    const delay = 800 + Math.random() * 1800;
    bubbleTimeout = setTimeout(spawnBubble, delay);
}
function spawnBubble() {
    if (!isPracticing) return;
    if (anyFlashActive()) { scheduleNextBubble(); return; }

    const size = 36;
    const topMin = 110;
    const bottomReserve = 220;
    const sideMargin = 60;
    const top = topMin + Math.random() * Math.max(60, window.innerHeight - topMin - bottomReserve);
    const left = sideMargin + Math.random() * Math.max(60, window.innerWidth - sideMargin * 2 - size);

    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.top = `${top}px`;
    b.style.left = `${left}px`;
    document.body.appendChild(b);

    const lifeMs = 1200;
    const expireTimer = setTimeout(() => {
        b.classList.add('expired');
        setTimeout(() => b.remove(), 280);
    }, lifeMs);

    b.addEventListener('click', () => {
        clearTimeout(expireTimer);
        if (bubblesBanked < BUBBLE_BANK_MAX) bubblesBanked++;
        score += 25;
        // Pitch climbs slowly with the bank so you can hear streak depth grow.
        const pitch = Math.min(2200, 600 + bubblesBanked * 25);
        playTone(pitch, 220, 'sine', 0.05);
        b.classList.add('pop');
        showFloatingText(`🫧 +25 · BANK ×${bubbleBankMult().toFixed(1)}`, '#c8aa6e');
        updateScoreUI();
        setTimeout(() => b.remove(), 240);
        // Reward fast aim with an immediate next bubble (cancel pending timer).
        if (bubbleTimeout) clearTimeout(bubbleTimeout);
        bubbleTimeout = setTimeout(spawnBubble, 80);
    });

    scheduleNextBubble();
}

// Generate a random flash event
function triggerRandomFlash(manualRole = null) {
    if (!isPracticing) return;

    // A role is available once either the 5-minute in-game Flash cooldown
    // has elapsed OR 60s of real time has passed since the spawn. The real-time
    // cap keeps slow clock speeds (1x/2x) from starving the spawn pool.
    const REAL_COOLDOWN_MS = 60000;
    const speed = parseFloat(clockSpeedSelect.value) || 1;
    const now = Date.now();
    const availableRoles = roles.filter(r => {
        const f = expectedFlashes[r.toLowerCase()];
        if (!f) return true;
        const ingameReady = gameTimeSeconds >= f.time;
        const realReady = now - f.realTimeSpawn >= REAL_COOLDOWN_MS;
        return ingameReady || realReady;
    });

    // If all roles are on cooldown, wait until the soonest one frees up
    // instead of rolling a fresh random delay on top of the gated state.
    if (availableRoles.length === 0) {
        if (!manualRole) {
            let earliestMs = Infinity;
            for (const r of roles) {
                const f = expectedFlashes[r.toLowerCase()];
                if (!f) continue;
                const ingameMs = Math.max(0, ((f.time - gameTimeSeconds) * 1000) / speed);
                const realMs = Math.max(0, REAL_COOLDOWN_MS - (now - f.realTimeSpawn));
                earliestMs = Math.min(earliestMs, Math.min(ingameMs, realMs));
            }
            if (scenarioTimeout) clearTimeout(scenarioTimeout);
            scenarioTimeout = setTimeout(() => triggerRandomFlash(), Math.max(200, earliestMs + 50));
        }
        return;
    }
    
    const randomRole = manualRole || availableRoles[Math.floor(Math.random() * availableRoles.length)];
    
    const roleLower = randomRole.toLowerCase();
    const timeFlashedSeconds = gameTimeSeconds;
    const expectedTimeSeconds = timeFlashedSeconds + 300; // 5 minutes
    
    expectedFlashes[roleLower] = {
        active: true,
        flashTime: timeFlashedSeconds,
        time: expectedTimeSeconds,
        realTimeSpawn: Date.now()
    };
    
    showNotification(`${randomRole} Flashed!`, randomRole, formatTime(timeFlashedSeconds));
    soundFlashSpawn();
    clearBubbles();

    // Teamfight Mode: 25% chance to trigger another simultaneous flash
    if (!manualRole && teamfightModeCheckbox.checked && Math.random() < 0.25) {
        const remainingRoles = availableRoles.filter(r => r !== randomRole);
        if (remainingRoles.length > 0) {
            const extraRole = remainingRoles[Math.floor(Math.random() * remainingRoles.length)];
            const extraRoleLower = extraRole.toLowerCase();
            expectedFlashes[extraRoleLower] = {
                active: true,
                flashTime: timeFlashedSeconds,
                time: expectedTimeSeconds,
                realTimeSpawn: Date.now()
            };
            // Small delay for UI purposes
            setTimeout(() => {
                showNotification(`${extraRole} Flashed!`, extraRole, formatTime(timeFlashedSeconds));
            }, 300);
        }
    }

    if (!manualRole) {
        scheduleNextFlash();
    }
}

function scheduleNextFlash() {
    if (scenarioTimeout) clearTimeout(scenarioTimeout);
    
    const freqSetting = flashFreqSelect.value;
    let minDel = 20000, maxDel = 40000;
    if (freqSetting === 'insane') { minDel = 3000; maxDel = 8000; }
    else if (freqSetting === 'high') { minDel = 8000; maxDel = 20000; }
    else if (freqSetting === 'low') { minDel = 40000; maxDel = 70000; }
    
    const nextEventDelay = Math.floor(Math.random() * (maxDel - minDel)) + minDel;
    scenarioTimeout = setTimeout(() => triggerRandomFlash(), nextEventDelay);
}

// Manual trigger flash
function manualTriggerFlash() {
    if (!isPracticing) return;
    triggerRandomFlash(); // will auto-reschedule
    
    if (!isChatActive) {
        document.body.focus();
    }
}

// Show notification in chat
function showNotification(text, role, timeFlashed) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    
    let timeText = timeFlashed;
    if (hardcoreModeCheckbox.checked) {
        timeText = '??:??'; // Hide exact time in hardcore mode
    }
    
    const pingerRole = roles[Math.floor(Math.random() * roles.length)];
    
    msgDiv.innerHTML = `<span style="color: #888;">${timeText}</span> <span style="color: #33cc33;">${pingerRole} (${pingerRole}):</span> <span style="color: #ffcc00;">${role}</span> used Flash`;
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Generate fake chat messages to distract the user
function triggerFakeChat() {
    if (!isPracticing || !distractionModeCheckbox.checked) return;
    
    const fakeMessages = [
        "jg diff", "mid diff", "sup diff", "adc diff", "top diff",
        "ff 15", "ff @15", "/ff",
        "why did u go in?", "why flash there", "why ult that", "why no wards",
        "we scale", "late game pls", "just farm", "group mid",
        "lag", "ping spike", "my internet is dying", "frozen wtf",
        "can i get blue buff?", "leash pls", "need red", "smite or not?",
        "report mid", "report jg", "/mute all", "mute pings",
        "gj", "nice", "wp", "gg", "clean", "huge",
        "mb", "my bad", "sry", "oops",
        "?", "??", "???", ". . .",
        "my mouse is broken", "keyboard sticky", "hand cramp",
        "omw", "coming", "rotating", "roaming", "b", "recall",
        "missing", "mia top", "mia mid", "ss bot",
        "wards plz", "vision???", "ward the bush", "check river",
        "push", "freeze", "slow push", "proxy",
        "focus adc", "focus the carry", "peel me", "engage",
        "sleeper op", "free lp", "ez clap", "insane outplay",
        // Old TSM / S2-S3 nostalgia, written like a tilted teammate
        "he's too tanky", "bro he's too tanky",
        "smite diff", "no smite again??", "smite check pls",
        "jg is saintvicious 2.0", "sv would've smited that",
        "xspecial would peel for me", "sup diff xspecial main btw",
        "chaox carry pls", "where's my chaox",
        "old tsm wouldn't lose this", "reginald would bench u",
        "dyrus farming wr", "oddone where",
        "wildturtle 4 fun", "bring back s2"
    ];

    const fakeNames = [
        "YasuoMain99", "ToxicRiver", "ILoveTeemo", "Gosu123", "HideOnBush",
        "FlashOnD", "SmurfsOnly", "QSSAndreTrue", "BaronDancer", "0-10 Support",
        "PerkzFanboy", "TiltProofLOL", "InhibitorEnjoyer", "SoloQHell",
        "AFKFarmer", "JgAndyyy", "PingMyTeam", "ScriptDetected?",
        "MonkaGiga", "LateGameKing", "NoHandsMid", "OneTrickAkali"
    ];
    const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    const msgText = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    
    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'chat-message-all'; // or create a team color class if desired
    prefixSpan.style.color = '#33cc33'; // Make teammates green
    prefixSpan.textContent = `[Team] ${name}: `;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-message-text';
    textSpan.textContent = msgText;
    
    msgDiv.appendChild(prefixSpan);
    msgDiv.appendChild(textSpan);
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Reschedule fake chat randomly between 4s and 14s
    const nextChatDelay = Math.floor(Math.random() * 10000) + 4000;
    distractionInterval = setTimeout(triggerFakeChat, nextChatDelay);
}

// Start Practice Session
function startPractice() {
    startScreen.style.display = 'none';
    isPracticing = true;
    
    // Show gamification UI
    scoreBoard.style.display = 'block';
    accuracyBoard.style.display = 'block';
    triggerBtn.style.display = 'inline-flex';
    resetBtn.style.display = 'inline-flex';
    
    score = 0;
    streak = 0;
    bubblesBanked = 0;
    sessionBest = 0;
    sessionCatches = 0;
    sessionMisses = 0;
    sessionBestStreak = 0;
    expectedFlashes = {};
    updateScoreUI();
    renderFlashTracker();

    sessionLengthSec = parseInt(sessionLengthSelect.value, 10) || 0;
    if (sessionLengthSec > 0) {
        sessionEndTime = Date.now() + sessionLengthSec * 1000;
        sessionTimerEl.classList.remove('warn', 'danger');
        sessionTimerFill.style.width = '100%';
        sessionTimerEl.style.display = 'block';
        updateSessionTimer();
    } else {
        sessionEndTime = 0;
        sessionTimerEl.style.display = 'none';
    }
    
    // 02:00 to 08:00
    gameTimeSeconds = Math.floor(Math.random() * 360) + 120; 
    gameClockEl.textContent = formatTime(gameTimeSeconds);
    chatHistory.innerHTML = '';
    
    const speed = parseFloat(clockSpeedSelect.value) || 1;
    clockInterval = setInterval(updateClock, Math.max(50, Math.round(1000 / speed)));
    
    // First flash starts soon
    scenarioTimeout = setTimeout(() => triggerRandomFlash(), 3000);
    
    // Start fake chat
    distractionInterval = setTimeout(triggerFakeChat, Math.floor(Math.random() * 4000) + 2000);

    scheduleNextBubble();
    
    document.body.focus();
}

// Reset button — end the session early and show results
function resetPractice() {
    if (isPracticing) {
        endSession(true);
    } else {
        startScreen.style.display = 'block';
    }
}

// Continue from results modal back to start screen
resultsContinueBtn.addEventListener('click', () => {
    resultsModal.style.display = 'none';
    gameClockEl.textContent = '00:00';
    chatHistory.innerHTML = '';
    startScreen.style.display = 'block';
});

// Event Listeners for Buttons
startBtn.addEventListener('click', startPractice);
resetBtn.addEventListener('click', resetPractice);
triggerBtn.addEventListener('click', manualTriggerFlash);

// Modal Event Listeners
infoBtn.addEventListener('click', () => {
    infoModal.style.display = 'block';
});
closeModal.addEventListener('click', () => {
    infoModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === infoModal) {
        infoModal.style.display = 'none';
    }
});

// Evaluate Gamification from Chat Message
function evaluateTimers(msgText) {
    const msg = msgText.toLowerCase();
    // Match e.g. "top 1420", "mid 1930", "sup 920", "adc 8:30"
    // 'adc' before 'ad' so the longer alias wins; both map to the 'adc' key.
    // Longer aliases first so e.g. 'adc' doesn't get partially matched as 'ad'.
    const regex = /(top|jgl|jg|adc|ad|mid|sup)\s*(\d{1,2})[:]?(\d{2})/g;
    const roleAlias = { ad: 'adc', jg: 'jgl' };
    let match;
    let hitCount = 0;

    while ((match = regex.exec(msg)) !== null) {
        const typedRole = roleAlias[match[1]] || match[1];
        const m = parseInt(match[2], 10);
        const s = parseInt(match[3], 10);
        const typedSeconds = m * 60 + s;
        
        if (expectedFlashes[typedRole] && expectedFlashes[typedRole].active) {
            const expectedSeconds = expectedFlashes[typedRole].time;
            
            // Allow +/- 5 in-game seconds margin of error for typing
            if (Math.abs(typedSeconds - expectedSeconds) <= 5) {
                hitCount++;
                expectedFlashes[typedRole].active = false; // Mark resolved
                
                const pointsGained = Math.round((100 + streak * 20) * bubbleBankMult());
                score += pointsGained;
                streak++;
                sessionCatches++;
                if (streak > sessionBestStreak) sessionBestStreak = streak;

                stats.totalScore += pointsGained;
                stats.flashesCaught++;
                if (streak > stats.highestStreak) {
                    stats.highestStreak = streak;
                }
                saveStats();
                
                showFloatingText(`${typedRole.toUpperCase()} · ${getCatchCallout(streak)} · +${pointsGained}`, '#55ff88');
                soundCatch(streak);
            }
        }
    }

    if (hitCount > 0) {
        updateScoreUI();
        pulseScore();
        renderFlashTracker();
    }
}

// Chat Controls
document.addEventListener('keydown', (e) => {
    if (infoModal.style.display === 'block') return;
    if (statsModal.style.display === 'block') return;
    if (resultsModal.style.display === 'block') return;

    if (e.key === 'Enter') {
        if (!isChatActive) {
            // Only allow opening chat if there's an active flash to record
            const hasActiveFlash = Object.values(expectedFlashes).some(flash => flash.active);
            if (!hasActiveFlash) {
                showChatBlockedNotification();
                return;
            }

            isChatActive = true;
            chatHud.classList.add('active');
            chatInput.focus();
        } else {
            const messageText = chatInput.value.trim();
            
            if (messageText !== '') {
                appendMessage(messageText);
                evaluateTimers(messageText);
            }
            
            chatInput.value = '';
            isChatActive = false;
            chatHud.classList.remove('active');
            chatInput.blur();
        }
    }
});

chatHud.addEventListener('mousedown', (e) => {
    if (isChatActive) {
        if (e.target.classList.contains('chat-message') || e.target.classList.contains('chat-message-text') || e.target.classList.contains('chat-message-all')) {
            return; 
        }
        
        if (e.target !== chatHistory && e.target !== chatInput) {
             e.preventDefault();
             chatInput.focus();
        }
    }
});

function appendMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    
    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'chat-message-all';
    prefixSpan.textContent = '[All] You: ';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-message-text';
    textSpan.textContent = text;
    
    msgDiv.appendChild(prefixSpan);
    msgDiv.appendChild(textSpan);
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

statsBtn.addEventListener('click', () => {
    updateStatsModal();
    statsModal.style.display = 'block';
});
closeStatsModal.addEventListener('click', () => {
    statsModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === statsModal) {
        statsModal.style.display = 'none';
    }
});
