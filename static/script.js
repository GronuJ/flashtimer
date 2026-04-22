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
let gameTimeSeconds = 0;
let clockInterval = null;
let scenarioTimeout = null;
let distractionInterval = null;
let isPracticing = false;

// Gamification State
let score = 0;
let streak = 0;
let sessionBest = 0;
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

function nextCatchPoints() { return 100 + streak * 20; }

function updateScoreUI(prevStreak = streak) {
    scoreVal.textContent = score;
    streakVal.textContent = streak;
    scoreNextEl.textContent = `+${nextCatchPoints()}`;

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

function pulseScore() {
    scoreVal.classList.remove('score-pulse');
    void scoreVal.offsetWidth;
    scoreVal.classList.add('score-pulse');
}

function renderFlashTracker() {
    if (!flashTracker) return;
    const active = Object.entries(expectedFlashes).filter(([, f]) => f.active);
    if (active.length === 0) { flashTracker.innerHTML = ''; return; }

    flashTracker.innerHTML = active.map(([role, f]) => {
        const deadline = f.flashTime + 60;
        const remaining = Math.max(0, deadline - gameTimeSeconds);
        const pct = Math.max(0, Math.min(100, (remaining / 60) * 100));
        const urgent = remaining <= 15 ? ' urgent' : '';
        return `
            <div class="flash-card${urgent}">
                <div class="flash-card-head">
                    <span class="flash-card-role">${role.toUpperCase()}</span>
                    <span class="flash-card-time">${remaining}s</span>
                </div>
                <div class="flash-card-bar"><div class="flash-card-fill" style="width:${pct}%"></div></div>
            </div>`;
    }).join('');
}

// Update clock
function updateClock() {
    gameTimeSeconds += 1;
    gameClockEl.textContent = formatTime(gameTimeSeconds);

    for (const role in expectedFlashes) {
        if (expectedFlashes[role].active) {
            if (gameTimeSeconds > expectedFlashes[role].flashTime + 60) {
                expectedFlashes[role].active = false;
                const prevStreak = streak;
                streak = 0;
                const missedTime = formatTime(expectedFlashes[role].time);
                showFloatingText(`Missed ${role.toUpperCase()}! Was ${missedTime}`, '#ff4444');
                updateScoreUI(prevStreak);
            }
        }
    }
    renderFlashTracker();
}
// Generate a random flash event
function triggerRandomFlash(manualRole = null) {
    if (!isPracticing) return;

    // Filter out roles that are currently on cooldown (5 minutes hasn't passed)
    const availableRoles = roles.filter(r => {
        const roleLower = r.toLowerCase();
        if (!expectedFlashes[roleLower]) return true;
        // It's on cooldown if the current in-game time is less than the expected flash time
        return gameTimeSeconds >= expectedFlashes[roleLower].time;
    });
    
    // If all roles are on cooldown, just reschedule
    if (availableRoles.length === 0) {
        if (!manualRole) {
            scheduleNextFlash();
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

    // Teamfight Mode: 25% chance to trigger another simultaneous flash
    if (!manualRole && teamfightModeCheckbox.checked && Math.random() < 0.25) {
        const remainingRoles = availableRoles.filter(r => r !== randomRole);
        if (remainingRoles.length > 0) {
            const extraRole = remainingRoles[Math.floor(Math.random() * remainingRoles.length)];
            const extraRoleLower = extraRole.toLowerCase();
            expectedFlashes[extraRoleLower] = {
                active: true,
                flashTime: timeFlashedSeconds,
                time: expectedTimeSeconds
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
    if (freqSetting === 'high') { minDel = 8000; maxDel = 20000; }
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
        "jg diff",
        "ff 15",
        "why did u go in?",
        "we scale",
        "lag",
        "can i get blue buff?",
        "report mid",
        "gj",
        "mb",
        "wp",
        "?",
        "my mouse is broken"
    ];
    
    const fakeNames = ["YasuoMain99", "ToxicRiver", "ILoveTeemo", "Gosu123", "HideOnBush"];
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
    
    // Reschedule fake chat randomly between 15s and 40s
    const nextChatDelay = Math.floor(Math.random() * 25000) + 15000;
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
    sessionBest = 0;
    expectedFlashes = {};
    updateScoreUI();
    renderFlashTracker();
    
    // 02:00 to 08:00
    gameTimeSeconds = Math.floor(Math.random() * 360) + 120; 
    gameClockEl.textContent = formatTime(gameTimeSeconds);
    chatHistory.innerHTML = '';
    
    clockInterval = setInterval(updateClock, 1000);
    
    // First flash starts soon
    scenarioTimeout = setTimeout(() => triggerRandomFlash(), 3000);
    
    // Start fake chat
    distractionInterval = setTimeout(triggerFakeChat, Math.floor(Math.random() * 10000) + 5000);
    
    document.body.focus();
}

// Reset Practice Session
function resetPractice() {
    if (isPracticing && score > 0) {
        stats.sessions.push({ ts: Date.now(), score });
        if (stats.sessions.length > 50) stats.sessions = stats.sessions.slice(-50);
        stats.sessionsPlayed++;
        saveStats();
    }
    isPracticing = false;
    
    scoreBoard.style.display = 'none';
    accuracyBoard.style.display = 'none';
    triggerBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    
    if (clockInterval) clearInterval(clockInterval);
    if (scenarioTimeout) clearTimeout(scenarioTimeout);
    if (distractionInterval) clearTimeout(distractionInterval);
    
    startScreen.style.display = 'block';
    gameClockEl.textContent = "00:00";
    chatHistory.innerHTML = '';
    
    if (isChatActive) {
        isChatActive = false;
        chatHud.classList.remove('active');
        chatInput.value = '';
        chatInput.blur();
    }
}

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
    const regex = /(top|jgl|mid|adc|sup)\s*(\d{1,2})[:]?(\d{2})/g;
    let match;
    let hitCount = 0;

    while ((match = regex.exec(msg)) !== null) {
        const typedRole = match[1];
        const m = parseInt(match[2], 10);
        const s = parseInt(match[3], 10);
        const typedSeconds = m * 60 + s;
        
        if (expectedFlashes[typedRole] && expectedFlashes[typedRole].active) {
            const expectedSeconds = expectedFlashes[typedRole].time;
            
            // Allow +/- 5 in-game seconds margin of error for typing
            if (Math.abs(typedSeconds - expectedSeconds) <= 5) {
                hitCount++;
                expectedFlashes[typedRole].active = false; // Mark resolved
                
                const pointsGained = 100 + (streak * 20);
                score += pointsGained;
                streak++;
                
                // Update Local Storage Stats
                stats.totalScore += pointsGained;
                stats.flashesCaught++;
                if (streak > stats.highestStreak) {
                    stats.highestStreak = streak;
                }
                saveStats();
                
                showFloatingText(`+${pointsGained} ${typedRole.toUpperCase()} OK!`, '#55ff55');
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

    if (e.key === 'Enter') {
        if (!isChatActive) {
            // Only allow opening chat if there's an active flash to record
            const hasActiveFlash = Object.values(expectedFlashes).some(flash => flash.active);
            if (!hasActiveFlash) return;

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
