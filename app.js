// ============================================================
// Global state
// ============================================================
const TOTAL_TARGETS = 20;
const FREE_MS = 30000;

let participantId = '';
let sessionId = '';
let allData = [];
let targetData = [];
let freeData = [];
let taskStart = 0;
let targetsDone = 0;
let currentTargetEl = null;

// ============================================================
// Utilities
// ============================================================
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}

// Clock
(function tickClock() {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleTimeString('ja-JP');
    setTimeout(tickClock, 1000);
})();

// ============================================================
// PAGE 1 → Start
// ============================================================
function startExperiment() {
    const raw = document.getElementById('pid-input').value.trim();
    const input = document.getElementById('pid-input');
    if (!raw) {
        input.classList.add('error');
        input.focus();
        return;
    }
    participantId = raw;
    sessionId = Date.now().toString(36).toUpperCase();
    document.getElementById('pid-label-1').textContent = `ID: ${participantId}`;
    document.getElementById('pid-label-2').textContent = `ID: ${participantId}`;
    showPage('page-target-intro');
}

document.getElementById('pid-input').addEventListener('input', function () {
    this.classList.remove('error');
});
document.getElementById('pid-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startExperiment();
});

// ============================================================
// PAGE 3: Target Task
// ============================================================
let targetMoveHandler = null;
let tCanvas, tCtx, trailPts = [];

function startTargetTask() {
    showPage('page-target');
    targetData = [];
    targetsDone = 0;
    trailPts = [];

    // Setup canvas
    const area = document.getElementById('target-area');
    tCanvas = document.getElementById('target-canvas');
    tCanvas.width = area.offsetWidth;
    tCanvas.height = area.offsetHeight;
    tCtx = tCanvas.getContext('2d');

    taskStart = performance.now();

    // Mouse tracking
    targetMoveHandler = (e) => {
        const rect = area.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const t = Math.round(performance.now() - taskStart);
        targetData.push({ task: 'target', event: 'move', x: Math.round(x), y: Math.round(y), t, tid: targetsDone, tx: '', ty: '' });
        document.getElementById('rec-pts').textContent = targetData.length;
        trailPts.push({ x, y });
        if (trailPts.length > 400) trailPts.shift();
        renderTrail();
    };
    area.addEventListener('mousemove', targetMoveHandler);

    spawnTarget();
}

function renderTrail() {
    if (!tCtx || trailPts.length < 2) return;
    tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    tCtx.beginPath();
    tCtx.moveTo(trailPts[0].x, trailPts[0].y);
    for (let i = 1; i < trailPts.length; i++) {
        const alpha = (i / trailPts.length) * 0.4;
        tCtx.strokeStyle = `rgba(0,212,170,${alpha})`;
        tCtx.lineWidth = 1.5;
        tCtx.lineTo(trailPts[i].x, trailPts[i].y);
        tCtx.stroke();
        tCtx.beginPath();
        tCtx.moveTo(trailPts[i].x, trailPts[i].y);
    }
}

function spawnTarget() {
    if (currentTargetEl) currentTargetEl.remove();
    const area = document.getElementById('target-area');
    const size = 56;
    const margin = 80;
    const mw = area.offsetWidth - size - margin;
    const mh = area.offsetHeight - size - margin;
    const left = margin + Math.random() * mw;
    const top = margin + Math.random() * mh;
    const cx = left + size / 2;
    const cy = top + size / 2;

    const div = document.createElement('div');
    div.className = 'target-circle';
    div.style.cssText = `width:${size}px;height:${size}px;left:${left}px;top:${top}px;`;

    const outer = document.createElement('div');
    outer.className = 'target-outer';
    const inner = document.createElement('div');
    inner.className = 'target-inner';
    div.appendChild(outer);
    div.appendChild(inner);

    div.addEventListener('click', (e) => {
        const rect = area.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        const t = Math.round(performance.now() - taskStart);
        targetData.push({ task: 'target', event: 'click', x, y, t, tid: targetsDone, tx: Math.round(cx), ty: Math.round(cy) });
        targetsDone++;
        document.getElementById('remaining').textContent = TOTAL_TARGETS - targetsDone;
        document.getElementById('clicked').textContent = targetsDone;

        if (targetsDone >= TOTAL_TARGETS) {
            finishTargetTask(area);
        } else {
            spawnTarget();
        }
    });

    area.appendChild(div);
    currentTargetEl = div;
}

function finishTargetTask(area) {
    if (currentTargetEl) { currentTargetEl.remove(); currentTargetEl = null; }
    area.removeEventListener('mousemove', targetMoveHandler);
    allData = allData.concat(targetData);
    showPage('page-free-intro');
}

// ============================================================
// PAGE 5: Free Movement Task
// ============================================================
let fCanvas, fCtx, fTrail = [];
let fMoveHandler = null, fClickHandler = null, fTimer = null;

function startFreeTask() {
    showPage('page-free');
    freeData = [];
    fTrail = [];

    const area = document.getElementById('free-area');
    area.classList.add('active');
    fCanvas = document.getElementById('free-canvas');
    fCanvas.width = area.offsetWidth;
    fCanvas.height = area.offsetHeight;
    fCtx = fCanvas.getContext('2d');

    taskStart = performance.now();

    fMoveHandler = (e) => {
        const rect = area.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < 0 || y < 0 || x > area.offsetWidth || y > area.offsetHeight) return;
        const t = Math.round(performance.now() - taskStart);
        freeData.push({ task: 'free', event: 'move', x: Math.round(x), y: Math.round(y), t, tid: '', tx: '', ty: '' });
        fTrail.push({ x, y });
        if (fTrail.length > 600) fTrail.shift();
        renderFreeTrail();
    };

    fClickHandler = (e) => {
        const rect = area.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        const t = Math.round(performance.now() - taskStart);
        freeData.push({ task: 'free', event: 'click', x, y, t, tid: '', tx: '', ty: '' });
    };

    area.addEventListener('mousemove', fMoveHandler);
    area.addEventListener('click', fClickHandler);

    fTimer = setInterval(() => {
        const elapsed = performance.now() - taskStart;
        const remaining = Math.max(0, FREE_MS - elapsed);
        const pct = (remaining / FREE_MS) * 100;
        const secs = Math.ceil(remaining / 1000);
        document.getElementById('timer-fill').style.width = pct + '%';
        document.getElementById('timer-text').textContent = secs + 's';
        document.getElementById('big-countdown').textContent = secs;

        if (remaining <= 0) {
            clearInterval(fTimer);
            finishFreeTask(area);
        }
    }, 200);
}

function renderFreeTrail() {
    if (!fCtx || fTrail.length < 2) return;
    fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
    for (let i = 1; i < fTrail.length; i++) {
        const alpha = (i / fTrail.length) * 0.45;
        fCtx.beginPath();
        fCtx.strokeStyle = `rgba(0,212,170,${alpha})`;
        fCtx.lineWidth = 1.5;
        fCtx.moveTo(fTrail[i - 1].x, fTrail[i - 1].y);
        fCtx.lineTo(fTrail[i].x, fTrail[i].y);
        fCtx.stroke();
    }
}

function finishFreeTask(area) {
    area.removeEventListener('mousemove', fMoveHandler);
    area.removeEventListener('click', fClickHandler);
    area.classList.remove('active');
    allData = allData.concat(freeData);
    showComplete();
}

// ============================================================
// PAGE 6: Complete
// ============================================================
function showComplete() {
    const totalClicks = targetData.filter(d => d.event === 'click').length;
    document.getElementById('sum-pid').textContent = participantId;
    document.getElementById('sum-sid').textContent = sessionId;
    document.getElementById('sum-pts').textContent = allData.length.toLocaleString();
    document.getElementById('sum-clicks').textContent = totalClicks;
    showPage('page-complete');
}

function downloadCSV() {
    const headers = ['task', 'event', 'x', 'y', 't_ms', 'target_id', 'target_x', 'target_y', 'participant_id', 'session_id'];
    const rows = allData.map(d => [
        d.task,
        d.event,
        d.x,
        d.y,
        d.t,
        d.tid !== '' ? d.tid : '',
        d.tx !== '' ? d.tx : '',
        d.ty !== '' ? d.ty : '',
        participantId,
        sessionId
    ].join(','));

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mouse_${participantId}_${sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
