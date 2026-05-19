// ============================================================
// 特徴量の定義
// ============================================================
const FEATURE_DEFS = [
    { key: 'speedMean',        label: '平均速度',       task: 'both'   },
    { key: 'speedMax',         label: '最高速度',       task: 'both'   },
    { key: 'speedStd',         label: '速度ばらつき',   task: 'both'   },
    { key: 'accelMean',        label: '平均加速度',     task: 'both'   },
    { key: 'angleChangeMean',  label: '方向転換角',     task: 'both'   },
    { key: 'linearity',        label: '直線度',         task: 'both'   },
    { key: 'reactionMean',     label: 'クリック間隔',   task: 'target' },
    { key: 'reactionStd',      label: 'クリック間隔SD', task: 'target' },
];

// ============================================================
// ユーティリティ
// ============================================================
function mean(arr) {
    const valid = arr.filter(v => isFinite(v));
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
}

function std(arr) {
    const valid = arr.filter(v => isFinite(v));
    if (valid.length < 2) return 0;
    const m = mean(valid);
    return Math.sqrt(valid.map(v => (v - m) ** 2).reduce((a, b) => a + b, 0) / valid.length);
}

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
    if (id === 'view-home') refreshHome();
}

// ============================================================
// CSV パース
// ============================================================
function parseCSV(text) {
    // BOM除去
    text = text.replace(/^\uFEFF/, '');
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i].trim() : ''; });
        // 数値変換
        ['x','y','t_ms','target_id','target_x','target_y'].forEach(k => {
            if (obj[k] !== '' && obj[k] !== undefined) obj[k] = parseFloat(obj[k]);
        });
        return obj;
    }).filter(r => r.task);
}

// ============================================================
// 特徴量抽出
// ============================================================
function extractFeatures(rows, task) {
    const moves = rows
        .filter(r => r.task === task && r.event === 'move')
        .sort((a, b) => a.t_ms - b.t_ms);
    const clicks = rows
        .filter(r => r.task === task && r.event === 'click')
        .sort((a, b) => a.t_ms - b.t_ms);

    if (moves.length < 2) return null;

    const speeds = [], accels = [], angles = [];
    let totalDist = 0;
    let prevAngle = null, prevSpeed = null;

    for (let i = 1; i < moves.length; i++) {
        const dx = moves[i].x - moves[i-1].x;
        const dy = moves[i].y - moves[i-1].y;
        const dt = moves[i].t_ms - moves[i-1].t_ms;
        if (dt === 0) continue;

        const dist  = Math.sqrt(dx*dx + dy*dy);
        const speed = dist / dt;
        totalDist += dist;
        speeds.push(speed);

        if (prevSpeed !== null) accels.push(Math.abs(speed - prevSpeed));
        prevSpeed = speed;

        const angle = Math.atan2(dy, dx);
        if (prevAngle !== null) angles.push(Math.abs(angle - prevAngle));
        prevAngle = angle;
    }

    const x0 = moves[0].x,  y0 = moves[0].y;
    const xn = moves[moves.length-1].x, yn = moves[moves.length-1].y;
    const straightDist = Math.sqrt((xn-x0)**2 + (yn-y0)**2);
    const linearity = totalDist > 0 ? straightDist / totalDist : NaN;

    let reactionMean = NaN, reactionStd = NaN;
    if (task === 'target' && clicks.length > 1) {
        const intervals = [];
        for (let i = 1; i < clicks.length; i++) {
            intervals.push(clicks[i].t_ms - clicks[i-1].t_ms);
        }
        reactionMean = mean(intervals);
        reactionStd  = std(intervals);
    }

    return {
        speedMean:       mean(speeds),
        speedMax:        Math.max(...speeds),
        speedStd:        std(speeds),
        accelMean:       mean(accels),
        angleChangeMean: mean(angles),
        linearity,
        reactionMean,
        reactionStd,
    };
}

// セッションの特徴量ベクトルをまとめてとる
function sessionToVector(rows) {
    const target = extractFeatures(rows, 'target');
    const free   = extractFeatures(rows, 'free');

    const vec = {};
    FEATURE_DEFS.forEach(({ key, task }) => {
        if (task === 'target' || task === 'both') {
            vec[`target_${key}`] = target ? (target[key] ?? NaN) : NaN;
        }
        if (task === 'free' || task === 'both') {
            vec[`free_${key}`]   = free   ? (free[key]   ?? NaN) : NaN;
        }
    });
    return vec;
}

// ============================================================
// データベース（localStorage）
// ============================================================
const DB_KEY = 'mouse_auth_db';

function loadDB() {
    try {
        return JSON.parse(localStorage.getItem(DB_KEY)) || { participants: {} };
    } catch { return { participants: {} }; }
}

function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function clearDatabase() {
    if (!confirm('データベースをリセットしますか？')) return;
    localStorage.removeItem(DB_KEY);
    refreshHome();
}

// ============================================================
// ホーム画面の更新
// ============================================================
function refreshHome() {
    const db = loadDB();
    const pids = Object.keys(db.participants);
    const count = pids.length;

    document.getElementById('home-count').textContent = `登録済み: ${count}人`;

    const status = document.getElementById('db-status');
    const list   = document.getElementById('db-list');

    if (count === 0) {
        status.style.display = 'none';
        return;
    }

    status.style.display = 'block';
    list.innerHTML = pids.map(pid => {
        const sessions = db.participants[pid].sessions.length;
        return `
            <div class="db-item">
                <span class="db-item-id">${pid}</span>
                <span class="db-item-sessions">${sessions} セッション</span>
            </div>`;
    }).join('');
}

// ============================================================
// ファイル受け取り
// ============================================================
function handleDrop(e, mode) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files, mode);
}

function handleFiles(files, mode) {
    if (!files || files.length === 0) return;
    if (mode === 'register') registerFiles(files);
    if (mode === 'auth')     authFile(files[0]);
}

// クリックでアップロードエリアをトリガー
document.getElementById('upload-area-register').addEventListener('click', () => {
    document.getElementById('file-input-register').click();
});
document.getElementById('upload-area-auth').addEventListener('click', () => {
    document.getElementById('file-input-auth').click();
});

// ============================================================
// 登録
// ============================================================
async function registerFiles(files) {
    const db = loadDB();
    const messages = [];

    for (const file of files) {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
            messages.push(`❌ ${file.name}: 読み込めませんでした`);
            continue;
        }

        const pid = rows[0].participant_id;
        const sid = rows[0].session_id;

        if (!pid) {
            messages.push(`❌ ${file.name}: participant_id が見つかりません`);
            continue;
        }

        if (!db.participants[pid]) {
            db.participants[pid] = { sessions: [] };
        }

        // 同じセッションIDが既にあれば上書き
        const idx = db.participants[pid].sessions.findIndex(s => s.session_id === sid);
        const vector = sessionToVector(rows);
        const entry  = { session_id: sid, vector };

        if (idx >= 0) {
            db.participants[pid].sessions[idx] = entry;
            messages.push(`🔄 ${file.name}: ${pid} / ${sid.slice(0,6)} を上書き登録`);
        } else {
            db.participants[pid].sessions.push(entry);
            messages.push(`✅ ${file.name}: ${pid} を登録（セッション${db.participants[pid].sessions.length}件目）`);
        }
    }

    saveDB(db);

    const box = document.getElementById('register-result');
    box.style.display = 'block';
    box.className = 'result-box success';
    box.innerHTML = messages.join('<br>');

    refreshHome();
}

// ============================================================
// 認証
// ============================================================
async function authFile(file) {
    const db  = loadDB();
    const pids = Object.keys(db.participants);

    if (pids.length === 0) {
        alert('先に被験者を登録してください。');
        return;
    }

    const text   = await file.text();
    const rows   = parseCSV(text);
    const unknown = sessionToVector(rows);

    // 各被験者の平均ベクトルを作る
    const templates = {};
    pids.forEach(pid => {
        const sessions = db.participants[pid].sessions;
        const keys = Object.keys(unknown);
        const avg = {};
        keys.forEach(k => {
            const vals = sessions.map(s => s.vector[k]).filter(v => isFinite(v));
            avg[k] = vals.length ? mean(vals) : NaN;
        });
        templates[pid] = avg;
    });

    // 全特徴量のレンジを計算（正規化用）
    const keys = Object.keys(unknown);
    const ranges = {};
    keys.forEach(k => {
        const allVals = pids.flatMap(pid =>
            db.participants[pid].sessions.map(s => s.vector[k])
        ).filter(v => isFinite(v));
        const mn = Math.min(...allVals);
        const mx = Math.max(...allVals);
        ranges[k] = mx - mn || 1;
    });

    // 正規化ユークリッド距離
    const distances = {};
    pids.forEach(pid => {
        let sumSq = 0, count = 0;
        keys.forEach(k => {
            const u = unknown[k];
            const t = templates[pid][k];
            if (isFinite(u) && isFinite(t)) {
                sumSq += ((u - t) / ranges[k]) ** 2;
                count++;
            }
        });
        distances[pid] = count > 0 ? Math.sqrt(sumSq / count) : Infinity;
    });

    // 距離→スコア（0〜100）
    const maxDist = Math.max(...Object.values(distances).filter(isFinite));
    const scores  = {};
    pids.forEach(pid => {
        const d = distances[pid];
        scores[pid] = isFinite(d) ? Math.max(0, (1 - d / (maxDist * 1.2)) * 100) : 0;
    });

    // ランキング
    const ranked = pids.slice().sort((a, b) => scores[b] - scores[a]);
    const winner = ranked[0];

    renderAuthResult(winner, scores, ranked, unknown, templates);
}

// ============================================================
// 認証結果の描画
// ============================================================
function renderAuthResult(winner, scores, ranked, unknown, templates) {
    document.getElementById('auth-result').style.display = 'block';

    // --- 判定結果 ---
    document.getElementById('result-verdict').innerHTML = `
        <div class="verdict-label">IDENTIFIED AS</div>
        <div class="verdict-name">${winner}</div>
        <div class="verdict-score">類似度スコア: ${scores[winner].toFixed(1)}%</div>
    `;

    // --- スコア一覧 ---
    const scoreList = document.getElementById('score-list');
    scoreList.innerHTML = ranked.map((pid, i) => `
        <div class="score-item ${i === 0 ? 'top' : ''}">
            <div class="score-row">
                <span class="score-id">${i+1}位  ${pid}</span>
                <span class="score-pct">${scores[pid].toFixed(1)}%</span>
            </div>
            <div class="score-bar-track">
                <div class="score-bar-fill" style="width:${scores[pid]}%"></div>
            </div>
        </div>
    `).join('');

    // --- 特徴量比較（上位1位との比較） ---
    const keys = Object.keys(unknown);
    const rows = FEATURE_DEFS.flatMap(({ key, label, task }) => {
        const taskKeys = task === 'both'
            ? [`target_${key}`, `free_${key}`]
            : [`target_${key}`];
        return taskKeys.map(k => {
            const u = unknown[k];
            const t = templates[winner][k];
            if (!isFinite(u) || !isFinite(t)) return '';
            const diff = Math.abs(u - t);
            const relDiff = diff / (Math.abs(t) || 1);
            const taskLabel = k.startsWith('target') ? '的当て' : '自由';
            const diffClass = relDiff < 0.2 ? 'close' : 'far';
            const diffMark  = relDiff < 0.2 ? '近い ✓' : '遠い ✗';
            return `
                <div class="feature-row">
                    <span class="feature-name">[${taskLabel}] ${label}</span>
                    <span class="feature-val unknown">${u.toFixed(4)}</span>
                    <span class="feature-diff ${diffClass}">${diffMark}</span>
                </div>`;
        });
    }).filter(Boolean).join('');

    document.getElementById('feature-compare').innerHTML = `
        <div class="feature-compare-title">特徴量の比較（未知 vs ${winner}）</div>
        <div class="feature-row" style="font-size:10px;color:#aaa;margin-bottom:4px">
            <span>特徴量</span><span style="text-align:right">未知の値</span><span style="text-align:right">判定</span>
        </div>
        ${rows}
    `;
}

// ============================================================
// 初期化
// ============================================================
refreshHome();
