(function () {
    const boardEl = document.getElementById('board');
    const turnEl = document.getElementById('turn');
    const stateEl = document.getElementById('state');
    const movesEl = document.getElementById('moves');
  
    const newGameBtn = document.getElementById('newGameBtn');
    const undoBtn = document.getElementById('undoBtn');
    const flipBtn = document.getElementById('flipBtn');
  
    const promoModal = document.createElement('div');
    promoModal.id = 'promoModal';
    promoModal.innerHTML = '<div class="card"><div>Promote to:</div><div id="promoChoices"></div></div>';
    document.body.appendChild(promoModal);
    const promoChoicesEl = promoModal.querySelector('#promoChoices');
  
    const files = ['a','b','c','d','e','f','g','h'];
    let orientation = 'w'; // White at bottom by default
    let selected = null;   // selected square like 'e2'
    let legalDests = new Set();
    let lastMoveSquares = [];
  
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
      if (isGameOver()) {
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
        lastMoveSquares = [from, to];
        selected = null;
        legalDests.clear();
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

    // Button event listeners
    function setupButtons() {
      newGameBtn.addEventListener('click', () => {
        if (game) {
          // Start standard position: White to move
          game.reset();
          selected = null; legalDests.clear(); lastMoveSquares = [];
          renderBoard(); updateStatus();
        }
      });
      undoBtn.addEventListener('click', () => {
        if (game) {
          game.undo();
          selected = null; legalDests.clear(); lastMoveSquares = [];
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