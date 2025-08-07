(function () {
    const boardEl = document.getElementById('board');
    const turnEl = document.getElementById('turn');
    const stateEl = document.getElementById('state');
    const movesEl = document.getElementById('moves');
  const whiteTimeEl = document.getElementById('whiteTime');
  const blackTimeEl = document.getElementById('blackTime');
  
    const newGameBtn = document.getElementById('newGameBtn');
    const undoBtn = document.getElementById('undoBtn');
    const flipBtn = document.getElementById('flipBtn');
  
    const promoModal = document.createElement('div');
    promoModal.id = 'promoModal';
    promoModal.innerHTML = '<div class="card"><div>Promote to:</div><div id="promoChoices"></div></div>';
    document.body.appendChild(promoModal);
    const promoChoicesEl = promoModal.querySelector('#promoChoices');

  // Chaos UI
  const chaosRuleEl = document.getElementById('chaosRule');
  const chaosRarityEl = document.getElementById('chaosRarity');
  const chaosCountdownSpan = document.getElementById('chaosCountdown');
  const allRulesEl = document.getElementById('allRules');
  const topHandEl = document.getElementById('topHand');
  const bottomHandEl = document.getElementById('bottomHand');
  
    const files = ['a','b','c','d','e','f','g','h'];
    let orientation = 'w'; // White at bottom by default
    let selected = null;   // selected square like 'e2'
    let legalDests = new Set();
    let lastMoveSquares = [];
  // Clocks
  let whiteMs = 5 * 60 * 1000; // 5 minutes in ms
  let blackMs = 5 * 60 * 1000;
  let clockIntervalId = null;
  let lastTickTs = 0;
  
    const pieceImage = {
      wp: 'assets/pieces/cburnett/Chess_plt45.svg',
      wn: 'assets/pieces/cburnett/Chess_nlt45.svg',
      wb: 'assets/pieces/cburnett/Chess_blt45.svg',
      wr: 'assets/pieces/cburnett/Chess_rlt45.svg',
      wq: 'assets/pieces/cburnett/Chess_qlt45.svg',
      wk: 'assets/pieces/cburnett/Chess_klt45.svg',
      bp: 'assets/pieces/cburnett/Chess_pdt45.svg',
      bn: 'assets/pieces/cburnett/Chess_ndt45.svg',
      bb: 'assets/pieces/cburnett/Chess_bdt45.svg',
      br: 'assets/pieces/cburnett/Chess_rdt45.svg',
      bq: 'assets/pieces/cburnett/Chess_qdt45.svg',
      bk: 'assets/pieces/cburnett/Chess_kdt45.svg',
    };
  
    // Initialize chess game
    let game;
    
    // Wait a bit for chess.js to be available
    function initGame() {
      console.log('Checking for chess.js...', typeof window.Chess);
      try {
        if (typeof window.Chess !== 'undefined') {
          console.log('Chess.js found, creating game instance...');
          game = new window.Chess();
          console.log('Game instance created:', game);
          // Setup buttons and initial render
          setupButtons();
          renderBoard();
          updateStatus();
        } else {
          console.log('Chess.js not found, retrying...');
          // Try again in a moment
          setTimeout(initGame, 100);
        }
      } catch (error) {
        console.error('Chess.js not loaded properly:', error);
        // Try to load chess.js manually if it failed
        loadChessJS();
      }
    }
    
    function loadChessJS() {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/chess.min.js';
      script.onload = function() {
        if (typeof window.Chess !== 'undefined') {
          game = new window.Chess();
          setupButtons();
          renderBoard();
          updateStatus();
        } else {
          showError('Failed to load chess library');
        }
      };
      script.onerror = function() {
        showError('Failed to load chess library from CDN');
      };
      document.head.appendChild(script);
    }
    
    function showError(message) {
      document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h2>Error Loading Chess Game</h2><p>' + message + '</p><p>Please refresh the page or try again later.</p></div>';
    }
    
    // Start initialization
    initGame();

  // ========== CHAOS ENGINE ==========
  let chaosActiveRule = null;
  let chaosDeadlineTs = 0;
  let chaosTickerId = null;
  let fogHideColor = null; // 'w' or 'b' to dim that side's pieces
  let forcedGameOver = false;
  let forcedGameOverMessage = '';
  let hasGameStarted = false;
  // Per-card timers storage
  const activeCardTimers = new Set();

  const CHAOS_RULES = [
    {
      rarity: 'rare',
      key: 'meteor',
      name: 'Meteor Strike',
      desc: 'A random non-king piece is obliterated on impact.',
      onEnable() {
        const all = listAllPieces({ excludeKings: true });
        if (all.length === 0) return;
        const victim = randomChoice(all);
        game.remove(victim.square);
        detectForcedGameOver();
      },
      onMove(_move) {
        // one-off effect only
      },
      onDisable() {}
    },
    {
      rarity: 'rare',
      key: 'power',
      name: 'Power Surge',
      desc: 'After each move, one of mover\'s pieces upgrades to a queen.',
      onEnable() {},
      onMove(move) {
        const moverColor = move.color; // 'w' or 'b'
        const candidates = listAllPieces({ color: moverColor, types: ['p','n','b','r'] });
        if (candidates.length === 0) return;
        const target = randomChoice(candidates);
        // Upgrade piece at target.square to queen
        game.remove(target.square);
        game.put({ type: 'q', color: moverColor }, target.square);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'trickster',
      name: 'Trickster Swap',
      desc: 'After each move, swap the moved piece with a random friendly piece (not king).',
      onEnable() {},
      onMove(move) {
        const moverColor = move.color;
        const movedTo = move.to; // algebraic square
        const sameSide = listAllPieces({ color: moverColor, excludeKings: true, excludeSquares: [movedTo] });
        if (sameSide.length === 0) return;
        const other = randomChoice(sameSide);
        const movedPiece = game.get(movedTo);
        const otherPiece = game.get(other.square);
        if (!movedPiece || !otherPiece) return;
        game.remove(movedTo);
        game.remove(other.square);
        game.put(otherPiece, movedTo);
        game.put(movedPiece, other.square);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'blinkSelf',
      name: 'Blink (Self)',
      desc: 'After each move, a random friendly non-king teleports to a random empty square.',
      onEnable() {},
      onMove(move) {
        const friends = listAllPieces({ color: move.color, excludeKings: true });
        const empties = listEmptySquares();
        if (!friends.length || !empties.length) return;
        const piece = randomChoice(friends);
        const dest = randomChoice(empties);
        const p = game.get(piece.square);
        if (!p) return;
        game.remove(piece.square);
        game.put(p, dest);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'blinkEnemy',
      name: 'Blink (Enemy)',
      desc: 'After each move, a random enemy non-king teleports to a random empty square.',
      onEnable() {},
      onMove(move) {
        const enemyColor = move.color === 'w' ? 'b' : 'w';
        const foes = listAllPieces({ color: enemyColor, excludeKings: true });
        const empties = listEmptySquares();
        if (!foes.length || !empties.length) return;
        const piece = randomChoice(foes);
        const dest = randomChoice(empties);
        const p = game.get(piece.square);
        if (!p) return;
        game.remove(piece.square);
        game.put(p, dest);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'common',
      key: 'pawnHop',
      name: 'Pawn Hop',
      desc: "After each move, a random friendly pawn hops forward one square if it's empty.",
      onEnable() {},
      onMove(move) {
        const pawns = listAllPieces({ color: move.color, types: ['p'] });
        if (!pawns.length) return;
        const sel = shuffle([...pawns]);
        for (const it of sel) {
          const dest = stepForward(it.square, move.color, 1);
          if (dest && !game.get(dest)) {
            const p = game.get(it.square);
            game.remove(it.square);
            game.put(p, dest);
            break;
          }
        }
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'rare',
      key: 'berserker',
      name: 'Berserker',
      desc: 'After each move, if the moved piece can capture immediately, it performs a random capture.',
      onEnable() {},
      onMove(move) {
        const opts = game.moves({ square: move.to, verbose: true }).filter(m => (m.flags || '').includes('c') || (m.flags || '').includes('e'));
        if (!opts.length) return;
        const cap = randomChoice(opts);
        game.move(cap);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'healingRain',
      name: 'Healing Rain',
      desc: 'One-time: summon a random minor piece for each side on a random empty home-half square.',
      onEnable() {
        ['w','b'].forEach(color => {
          const empties = listEmptySquaresInHalf(color);
          if (!empties.length) return;
          const sq = randomChoice(empties);
          const type = randomChoice(['n','b']);
          game.put({ type, color }, sq);
        });
        detectForcedGameOver();
      },
      onMove() {},
      onDisable() {}
    },
    {
      rarity: 'common',
      key: 'veil',
      name: 'Veil of Shadows',
      desc: 'Opponent pieces are veiled (dimmed).',
      onEnable() {
        fogHideColor = game.turn() === 'w' ? 'b' : 'w';
      },
      onMove() {
        fogHideColor = game.turn() === 'w' ? 'b' : 'w';
      },
      onDisable() { fogHideColor = null; }
    },
    {
      rarity: 'legendary',
      key: 'cornerLava',
      name: 'Corner Lava',
      desc: 'Any piece in a corner square is burned away (kings are immune).',
      onEnable() {},
      onMove() {
        ['a1','h1','a8','h8'].forEach(sq => {
          const p = game.get(sq);
          if (p && p.type !== 'k') game.remove(sq);
        });
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'spectralSwap',
      name: 'Spectral Swap',
      desc: 'After each move, swap two random friendly non-king pieces.',
      onEnable() {},
      onMove(move) {
        const pieces = listAllPieces({ color: move.color, excludeKings: true });
        if (pieces.length < 2) return;
        const a = randomChoice(pieces);
        let b = randomChoice(pieces);
        let guard = 0;
        while (b.square === a.square && guard++ < 10) b = randomChoice(pieces);
        if (a.square === b.square) return;
        const pa = game.get(a.square);
        const pb = game.get(b.square);
        game.remove(a.square); game.remove(b.square);
        game.put(pb, a.square); game.put(pa, b.square);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'frenzy',
      name: 'Frenzy',
      desc: 'After each move, a random friendly pawn mutates into a random piece (Q/R/B/N).',
      onEnable() {},
      onMove(move) {
        const pawns = listAllPieces({ color: move.color, types: ['p'] });
        if (!pawns.length) return;
        const target = randomChoice(pawns);
        const t = randomChoice(['q','r','b','n']);
        game.remove(target.square);
        game.put({ type: t, color: move.color }, target.square);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'legendary',
      key: 'queenless',
      name: 'Queenless Chaos',
      desc: 'One-time: all queens vanish from the board.',
      onEnable() {
        const qs = listAllPieces({ types: ['q'] });
        qs.forEach(q => game.remove(q.square));
        detectForcedGameOver();
      },
      onMove() {},
      onDisable() {}
    },
    {
      rarity: 'rare',
      key: 'knightRain',
      name: 'Knight Rain',
      desc: 'One-time: a random knight spawns for each side in its home half.',
      onEnable() {
        ['w','b'].forEach(color => {
          const empties = listEmptySquaresInHalf(color);
          if (!empties.length) return;
          const sq = randomChoice(empties);
          game.put({ type: 'n', color }, sq);
        });
        detectForcedGameOver();
      },
      onMove() {},
      onDisable() {}
    },
    {
      rarity: 'common',
      key: 'rookRoll',
      name: 'Rook Roll',
      desc: 'After each move, a random friendly rook slides one file left/right if empty.',
      onEnable() {},
      onMove(move) {
        const rooks = listAllPieces({ color: move.color, types: ['r'] });
        if (!rooks.length) return;
        const r = randomChoice(rooks);
        const fileIdx = files.indexOf(r.square[0]);
        const rank = parseInt(r.square[1], 10);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const nf = fileIdx + dir;
        if (nf < 0 || nf > 7) return;
        const dest = `${files[nf]}${rank}`;
        if (!game.get(dest)) {
          const piece = game.get(r.square);
          game.remove(r.square);
          game.put(piece, dest);
          detectForcedGameOver();
        }
      },
      onDisable() {}
    },
    {
      rarity: 'common',
      key: 'bishopSlide',
      name: 'Bishop Slide',
      desc: 'After each move, a random friendly bishop slides one random diagonal if empty.',
      onEnable() {},
      onMove(move) {
        const bishops = listAllPieces({ color: move.color, types: ['b'] });
        if (!bishops.length) return;
        const b = randomChoice(bishops);
        const fileIdx = files.indexOf(b.square[0]);
        const rank = parseInt(b.square[1], 10);
        const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
        const [df, dr] = randomChoice(dirs);
        const nf = fileIdx + df; const nr = rank + dr;
        if (nf < 0 || nf > 7 || nr < 1 || nr > 8) return;
        const dest = `${files[nf]}${nr}`;
        if (!game.get(dest)) {
          const p = game.get(b.square);
          game.remove(b.square);
          game.put(p, dest);
          detectForcedGameOver();
        }
      },
      onDisable() {}
    },
    {
      rarity: 'common',
      key: 'enemyNudge',
      name: 'Enemy Nudge',
      desc: 'After each move, a random enemy pawn advances one square if empty.',
      onEnable() {},
      onMove(move) {
        const enemy = move.color === 'w' ? 'b' : 'w';
        const pawns = listAllPieces({ color: enemy, types: ['p'] });
        if (!pawns.length) return;
        const shuffled = shuffle(pawns);
        for (const it of shuffled) {
          const dest = stepForward(it.square, enemy, 1);
          if (dest && !game.get(dest)) {
            const p = game.get(it.square);
            game.remove(it.square);
            game.put(p, dest);
            break;
          }
        }
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'pawnExplosion',
      name: 'Pawn Explosion',
      desc: 'After each move, remove one random pawn from each side (if any).',
      onEnable() {},
      onMove() {
        ['w','b'].forEach(color => {
          const pawns = listAllPieces({ color, types: ['p'] });
          if (pawns.length) {
            const v = randomChoice(pawns);
            game.remove(v.square);
          }
        });
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'wallBuilder',
      name: 'Wall Builder',
      desc: 'After each move, spawn a friendly pawn on rank 3 (White) / 6 (Black) at a random empty file.',
      onEnable() {},
      onMove(move) {
        const rank = move.color === 'w' ? 3 : 6;
        const empties = files.map(f => `${f}${rank}`).filter(sq => !game.get(sq));
        if (!empties.length) return;
        const sq = randomChoice(empties);
        game.put({ type: 'p', color: move.color }, sq);
        detectForcedGameOver();
      },
      onDisable() {}
    },
    {
      rarity: 'uncommon',
      key: 'jester',
      name: 'Jester',
      desc: 'After each move, mutate a random friendly non-king piece into another type (Q/R/B/N/P).',
      onEnable() {},
      onMove(move) {
        const pool = listAllPieces({ color: move.color, excludeKings: true });
        if (!pool.length) return;
        const target = randomChoice(pool);
        const newType = randomChoice(['q','r','b','n','p']);
        const color = move.color;
        game.remove(target.square);
        game.put({ type: newType, color }, target.square);
        detectForcedGameOver();
      },
      onDisable() {}
    }
  ];

  function randomInt(min, max) { // inclusive
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickChaosRuleByRarity() {
    // Weighted rarity selection: common 50%, uncommon 30%, rare 15%, legendary 5%
    const roll = Math.random();
    let target = 'common';
    if (roll < 0.05) target = 'legendary';
    else if (roll < 0.20) target = 'rare';
    else if (roll < 0.50) target = 'uncommon';
    const pool = CHAOS_RULES.filter(r => r.rarity === target);
    return randomChoice(pool.length ? pool : CHAOS_RULES);
  }
  function renderHands() {
    if (!topHandEl || !bottomHandEl) return;
    topHandEl.innerHTML = '';
    bottomHandEl.innerHTML = '';
    for (let i = 0; i < 3; i++) topHandEl.appendChild(createCard(pickChaosRuleByRarity(), 'b'));
    for (let i = 0; i < 3; i++) bottomHandEl.appendChild(createCard(pickChaosRuleByRarity(), 'w'));
  }
  function createCard(rule, side) {
    const timedKeys = ['blinkSelf','blinkEnemy','pawnHop','berserker','veil','spectralSwap','frenzy','rookRoll','bishopSlide','enemyNudge','wallBuilder','jester'];
    const oneTimeKeys = ['meteor','power','healingRain','cornerLava','queenless','knightRain','pawnExplosion'];
    const isTimed = timedKeys.includes(rule.key);
    const isOneTime = oneTimeKeys.includes(rule.key);
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `<div class="name">${rule.name}</div><div class="desc">${rule.desc}</div><div class="rarity ${rule.rarity}">${rule.rarity}</div>${isTimed ? '<div class="timer"></div>' : ''}`;
    li.addEventListener('click', () => {
      if (li.dataset.played === '1') return; // prevent double-click
      li.dataset.played = '1';
      if (isOneTime) {
        li.classList.add('active');
        // Immediate effect without needing a board click
        setChaosRule(rule, { side });
        li.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 300, iterations: 2 });
        setTimeout(() => {
          li.remove();
          setTimeout(() => {
            const parent = side === 'w' ? bottomHandEl : topHandEl;
            if (parent) parent.appendChild(createCard(pickChaosRuleByRarity(), side));
          }, 30000);
        }, 400);
        return;
      }
      if (isTimed) {
        const timerEl = li.querySelector('.timer');
        const dur = 5000 + Math.floor(Math.random() * 20000); // 5s..25s
        const endsAt = Date.now() + dur;
        li.classList.add('active');
        if (timerEl) timerEl.textContent = `${Math.ceil(dur / 1000)}s`;
        activeCardTimers.add({ id: Math.random(), elTimer: timerEl, endsAt, side, rule, cardEl: li });
        // Enable timed effect immediately without waiting for a move
        setChaosRule(rule, { side });
        setTimeout(() => {
          const parent = side === 'w' ? bottomHandEl : topHandEl;
          if (parent && parent.children.length < 5) parent.appendChild(createCard(pickChaosRuleByRarity(), side));
        }, 30000);
      }
    });
    return li;
  }
  function shuffle(arr) { for (let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
  function listEmptySquares() {
    const out = [];
    for (let fi = 0; fi < 8; fi++) {
      for (let r = 1; r <= 8; r++) {
        const sq = `${files[fi]}${r}`;
        if (!game.get(sq)) out.push(sq);
      }
    }
    return out;
  }
  function listEmptySquaresInHalf(color) {
    const ranks = color === 'w' ? [1,2,3,4] : [5,6,7,8];
    const out = [];
    for (let fi = 0; fi < 8; fi++) {
      for (const r of ranks) {
        const sq = `${files[fi]}${r}`;
        if (!game.get(sq)) out.push(sq);
      }
    }
    return out;
  }
  function stepForward(square, color, steps) {
    const file = square[0];
    const rank = parseInt(square[1], 10);
    const nr = color === 'w' ? rank + steps : rank - steps;
    if (nr < 1 || nr > 8) return null;
    return `${file}${nr}`;
  }
  function resetChaosVisuals() { fogHideColor = null; }
  function detectForcedGameOver() {
    const kings = listAllPieces({ types: ['k'] });
    const hasW = kings.some(k => k.piece.color === 'w');
    const hasB = kings.some(k => k.piece.color === 'b');
    if (!hasW || !hasB) {
      forcedGameOver = true;
      forcedGameOverMessage = !hasW ? 'White king captured. Black wins.' : 'Black king captured. White wins.';
      if (chaosTickerId) { clearInterval(chaosTickerId); chaosTickerId = null; }
      selected = null; legalDests.clear();
      return true;
    }
    return false;
  }

  function listAllPieces(opts = {}) {
    const { color, excludeKings, excludeSquares = [], types } = opts;
    const out = [];
    const b = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p) continue;
        if (color && p.color !== color) continue;
        if (excludeKings && p.type === 'k') continue;
        if (types && !types.includes(p.type)) continue;
        const file = 'abcdefgh'[c];
        const rank = 8 - r;
        const sq = `${file}${rank}`;
        if (excludeSquares.includes(sq)) continue;
        out.push({ square: sq, piece: p });
      }
    }
    return out;
  }

  function setChaosRule(rule, ctx) {
    // Mark last-activated rule for display; do not disable others
    chaosActiveRule = rule;
    chaosRuleEl.textContent = rule ? `${rule.name}: ${rule.desc}` : '';
    if (chaosRarityEl) chaosRarityEl.textContent = rule ? `Rarity: ${rule.rarity}` : '';
    if (rule && rule.onEnable) {
      rule.onEnable(ctx);
      // Ensure immediate effects reflect on the board
      selected = null; legalDests.clear();
      renderBoard(); updateStatus();
    }
    highlightActiveRuleInList();
  }

  function scheduleChaos() {
    const nextInMs = 20000; // 20 seconds fixed
    chaosDeadlineTs = Date.now() + nextInMs;
  }

  function startChaosTicker() {
    // Drive per-card countdowns only
    if (chaosTickerId) clearInterval(chaosTickerId);
    if (chaosCountdownSpan) chaosCountdownSpan.textContent = '—';
    chaosTickerId = setInterval(() => {
      const now = Date.now();
      for (const t of Array.from(activeCardTimers)) {
        const ms = Math.max(0, t.endsAt - now);
        if (t.elTimer) t.elTimer.textContent = `${Math.ceil(ms / 1000)}s`;
        // outline color thresholds
        const secs = Math.ceil(ms / 1000);
        if (t.cardEl) {
          t.cardEl.classList.toggle('state-warning', secs <= 6 && secs > 3);
          t.cardEl.classList.toggle('state-danger', secs <= 3 && secs > 0);
        }
        if (ms <= 0) {
          activeCardTimers.delete(t);
          if (t.cardEl) {
            const parent = t.cardEl.parentElement;
            t.cardEl.classList.add('explode');
            setTimeout(() => {
              t.cardEl.remove();
              // auto-deal a replacement after 30s from now
              setTimeout(() => {
                const container = t.side === 'w' ? bottomHandEl : topHandEl;
                if (container) container.appendChild(createCard(pickChaosRuleByRarity(), t.side));
              }, 30000);
            }, 300);
          }
        }
      }
    }, 250);
  }

  function renderAllRulesList() {
    if (!allRulesEl) return;
    allRulesEl.innerHTML = '';
    CHAOS_RULES.forEach((r, idx) => {
      const li = document.createElement('li');
      li.className = 'rule-item';
      li.dataset.ruleKey = r.key;
      li.innerHTML = `<div class="name">${r.name} <span class="rarity ${r.rarity}">${r.rarity}</span></div><div class="desc">${r.desc}</div>`;
      allRulesEl.appendChild(li);
    });
  }
  function highlightActiveRuleInList() {
    if (!allRulesEl) return;
    const items = allRulesEl.querySelectorAll('.rule-item');
    items.forEach(it => it.classList.remove('active'));
    if (!chaosActiveRule) return;
    const active = allRulesEl.querySelector(`.rule-item[data-rule-key="${chaosActiveRule.key}"]`);
    if (active) active.classList.add('active');
  }

  // start chaos system after DOM is ready (but do not start countdown until first move)
  startChaosTicker();
  resetClocks();
  renderAllRulesList();
  renderHands();
  
    function squareAt(fileIndex, rankIndexFromTop) {
      // rankIndexFromTop: 0..7 from top of UI
      const rank = orientation === 'w' ? (8 - rankIndexFromTop) : (rankIndexFromTop + 1);
      const file = orientation === 'w' ? files[fileIndex] : files[7 - fileIndex];
      return `${file}${rank}`;
    }
  
    function renderCoords() {
      // files footer
      const filesBar = document.querySelector('.coords.files');
      filesBar.innerHTML = '';
      const filesArr = orientation === 'w' ? files : [...files].reverse();
      filesArr.forEach(f => {
        const div = document.createElement('div');
        div.className = 'cell';
        div.textContent = f;
        filesBar.appendChild(div);
      });
      // ranks sidebar
      const ranksBar = document.querySelector('.coords.ranks');
      ranksBar.innerHTML = '';
      const ranksArr = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
      ranksArr.forEach(r => {
        const div = document.createElement('div');
        div.className = 'cell';
        div.textContent = r;
        ranksBar.appendChild(div);
      });
    }
  
    function renderBoard() {
      boardEl.innerHTML = '';
      renderCoords();
  
      const board = game.board(); // not used directly for mapping
      const ranks = new Array(8).fill(0); // iterate 8x8 by UI rows
  
      for (let r = 0; r < 8; r++) {
        const row = r; // unused placeholder
        for (let f = 0; f < 8; f++) {
          const square = squareAt(f, r);
          const pieceInfo = game.get(square); // { type:'p', color:'w' } or null
  
          const sqEl = document.createElement('div');
          sqEl.className = `square ${((f + r) % 2 === 0) ? 'light' : 'dark'}`;
          sqEl.dataset.square = square;
          sqEl.setAttribute('role','gridcell');
          sqEl.setAttribute('aria-label', square);
  
          if (pieceInfo) {
            const key = `${pieceInfo.color}${pieceInfo.type}`;
            const imgSrc = pieceImage[key];
            if (imgSrc) {
              const img = document.createElement('img');
              img.src = imgSrc;
              img.alt = key;
              img.draggable = false;
              img.className = 'piece-img';
              if (fogHideColor && pieceInfo.color === fogHideColor) {
                img.style.opacity = '0.35';
              }
              sqEl.appendChild(img);
            }
          }
  
          if (lastMoveSquares.includes(square)) {
            sqEl.classList.add('last-move');
          }
  
          if (selected === square) sqEl.classList.add('sel');
          if (legalDests.has(square)) sqEl.classList.add('dest');
          if (legalDests.has(square) && pieceInfo && pieceInfo.color !== game.turn()) sqEl.classList.add('capture');
  
          sqEl.addEventListener('click', onSquareClick);
          boardEl.appendChild(sqEl);
        }
      }
  
      // king in check highlighting
      if (game.in_check()) {
        const kingSquare = findKingSquare(game.turn());
        if (kingSquare) {
          const el = boardEl.querySelector(`[data-square="${kingSquare}"]`);
          if (el) el.classList.add('check');
        }
      }
    }
  
    function updateStatus() {
      const turn = game.turn() === 'w' ? 'White' : 'Black';
      turnEl.textContent = turn;
  
      let text = '';
      if (forcedGameOver || isGameOver()) {
        if (forcedGameOver) {
          stateEl.textContent = forcedGameOverMessage;
          return;
        }
        if (game.in_checkmate()) text = `Checkmate. ${turn === 'White' ? 'Black' : 'White'} wins.`;
        else if (game.in_stalemate()) text = 'Stalemate.';
        else if (isDrawByFiftyMoves()) text = 'Draw (50-move rule).';
        else if (game.insufficient_material()) text = 'Draw (insufficient material).';
        else if (game.in_threefold_repetition()) text = 'Draw (threefold repetition).';
        else text = 'Game over.';
      } else if (game.in_check()) {
        text = 'Check!';
      } else {
        text = '';
      }
      stateEl.textContent = text;
  
      // moves list (simple)
      const history = game.history();
      movesEl.innerHTML = '';
      for (let i = 0; i < history.length; i += 2) {
        const li = document.createElement('li');
        const whiteMove = history[i] || '';
        const blackMove = history[i + 1] || '';
        li.textContent = blackMove ? `${whiteMove}  ${blackMove}` : `${whiteMove}`;
        movesEl.appendChild(li);
      }

      // Clocks rendering
      if (whiteTimeEl) whiteTimeEl.textContent = formatMs(whiteMs);
      if (blackTimeEl) blackTimeEl.textContent = formatMs(blackMs);
    }
  
    function setSelection(square) {
      selected = square;
      legalDests.clear();
      if (square) {
        const ms = game.moves({ square, verbose: true });
        for (const m of ms) legalDests.add(m.to);
      }
      renderBoard();
    }
  
    function onSquareClick(e) {
      const square = e.currentTarget.dataset.square;
      const piece = game.get(square); // { type:'p', color:'w' } or undefined
  
      // First click or switching selection
      if (!selected) {
        if (piece && piece.color === game.turn()) setSelection(square);
        return;
      }
  
      // Clicking same color piece switches selection
      if (piece && piece.color === game.turn() && square !== selected) {
        setSelection(square);
        return;
      }
  
      // Attempt move
      if (selected) {
        const needsPromotion = willPromote(selected, square);
        if (needsPromotion) {
          openPromotionDialog(game.turn(), (promo) => completeMove(selected, square, promo));
        } else {
          completeMove(selected, square, undefined);
        }
      }
    }
  
    function willPromote(from, to) {
      const piece = game.get(from);
      if (!piece || piece.type !== 'p') return false;
      const destRank = parseInt(to[1], 10);
      return (piece.color === 'w' && destRank === 8) || (piece.color === 'b' && destRank === 1);
    }
  
    function completeMove(from, to, promotion) {
      try {
        const move = promotion ? { from, to, promotion } : { from, to };
        const res = game.move(move);
        if (!res) return; // illegal
        if (detectForcedGameOver()) { renderBoard(); updateStatus(); return; }
        // Apply chaos rule post-move effects
        if (chaosActiveRule && typeof chaosActiveRule.onMove === 'function') {
          chaosActiveRule.onMove(res);
        }
        if (detectForcedGameOver()) { renderBoard(); updateStatus(); return; }
        lastMoveSquares = [from, to];
        selected = null;
        legalDests.clear();
        // On the very first move of the game, start the clocks and chaos countdown
        if (!hasGameStarted) {
          hasGameStarted = true;
          startClockForTurn();
          scheduleChaos();
        } else {
          switchClock();
        }
        renderBoard();
        updateStatus();
      } catch (_) {
        // ignore
      }
    }
  
    function openPromotionDialog(color, cb) {
      promoChoicesEl.innerHTML = '';
      const pieces = color === 'w' ? ['q','r','b','n'] : ['q','r','b','n'];
      const unicodeMap = color === 'w' ? { q:'♕', r:'♖', b:'♗', n:'♘' } : { q:'♛', r:'♜', b:'♝', n:'♞' };
      pieces.forEach(p => {
        const btn = document.createElement('button');
        btn.textContent = unicodeMap[p];
        btn.addEventListener('click', () => { closePromotionDialog(); cb(p); });
        promoChoicesEl.appendChild(btn);
      });
      promoModal.style.display = 'flex';
    }
    function closePromotionDialog() { promoModal.style.display = 'none'; }
  
    // Helpers to adapt API naming across chess.js versions
    function isGameOver() { return game.game_over ? game.game_over() : game.isGameOver(); }
    function isDrawByFiftyMoves() {
      // chess.js exposes draw via in_draw() with 50-move included
      if (typeof game.in_draw === 'function') return game.in_draw() && game.history().length > 0;
      return typeof game.isDrawByFiftyMoves === 'function' ? game.isDrawByFiftyMoves() : false;
    }
    function findKingSquare(color) {
      // Scan board for king of given color
      const b = game.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = b[r][c];
          if (p && p.type === 'k' && p.color === color) {
            const file = 'abcdefgh'[c];
            const rank = 8 - r;
            return `${file}${rank}`;
          }
        }
      }
      return null;
    }

    // Chess clock helpers
    function formatMs(ms) {
      const m = Math.max(0, Math.floor(ms / 60000));
      const s = Math.max(0, Math.floor((ms % 60000) / 1000));
      return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    function resetClocks() {
      whiteMs = 5 * 60 * 1000;
      blackMs = 5 * 60 * 1000;
      stopClock();
      if (whiteTimeEl) whiteTimeEl.textContent = formatMs(whiteMs);
      if (blackTimeEl) blackTimeEl.textContent = formatMs(blackMs);
    }
    function stopClock() {
      if (clockIntervalId) { clearInterval(clockIntervalId); clockIntervalId = null; }
    }
    function startClockForTurn() {
      stopClock();
      lastTickTs = performance.now();
      clockIntervalId = setInterval(() => {
        const now = performance.now();
        const delta = now - lastTickTs;
        lastTickTs = now;
        if (game.turn() === 'w') {
          whiteMs -= delta;
          if (whiteMs <= 0) {
            whiteMs = 0; stopClock();
            forcedGameOver = true; forcedGameOverMessage = 'White ran out of time. Black wins.';
          }
        } else {
          blackMs -= delta;
          if (blackMs <= 0) {
            blackMs = 0; stopClock();
            forcedGameOver = true; forcedGameOverMessage = 'Black ran out of time. White wins.';
          }
        }
        updateStatus();
      }, 100);
    }
    function switchClock() {
      startClockForTurn();
    }

    // Button event listeners
    function setupButtons() {
      newGameBtn.addEventListener('click', () => {
        if (game) {
          // Start standard position: White to move
          game.reset();
          selected = null; legalDests.clear(); lastMoveSquares = [];
          // Stop all chaos and clear active timers/cards
          activeCardTimers.clear();
          if (topHandEl) topHandEl.innerHTML = '';
          if (bottomHandEl) bottomHandEl.innerHTML = '';
          renderHands();
          resetClocks();
          startClockForTurn();
          renderBoard(); updateStatus();
        }
      });
      undoBtn.addEventListener('click', () => {
        if (game) {
          game.undo();
          selected = null; legalDests.clear(); lastMoveSquares = [];
          // After undo, restart clock for current turn
          startClockForTurn();
          renderBoard(); updateStatus();
        }
      });
      flipBtn.addEventListener('click', () => {
        orientation = orientation === 'w' ? 'b' : 'w';
        renderBoard();
      });
    }
  
    // Initialization is now handled in initGame()
  })();