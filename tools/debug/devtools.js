/**
 * Browser-side debugging helpers for Merge Legacy.
 *
 * Paste this into the dev console (or evaluate it through the browser tool)
 * and everything hangs off `__dbg`. It is a DEV FILE - nothing imports it and
 * it never ships.
 *
 * The three traps it exists to remove, all of which have cost real time:
 *
 *  1. WRITING A SAVE WITHOUT RELOADING IN THE SAME TICK. The running game
 *     holds its state in memory and autosaves over localStorage, so a write
 *     followed by a separate reload command is a coin flip - sometimes the
 *     game clobbers it first. Every write here reloads immediately.
 *  2. ERROR LISTS DYING ON RELOAD. Hand-installed listeners lose everything
 *     they caught the moment you refresh, so a crash seen once is gone before
 *     you can read it. `watch()` stores into sessionStorage, so `errors()`
 *     ACCUMULATES across reloads. Note the honest limit: the listener itself
 *     is not in the bundle, so re-eval this file after each reload to keep
 *     capturing - anything thrown before that eval is missed.
 *  3. "IS IT FROZEN?" GUESSWORK. A locked game still renders. `health()`
 *     reports the flags that actually gate input alongside the frame rate,
 *     because `inputLocked` stuck true is what a freeze usually is.
 */
(() => {
  const KEY = 'merge-game-save-v1';
  const ERRS = '__dbg_errors';
  const scene = () => window.game?.scene?.getScenes(true)?.[0] ?? null;
  const read = (k = KEY) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

  /** Writes a save and reloads in the SAME tick. See trap 1. */
  const commit = (save) => {
    localStorage.setItem(KEY, JSON.stringify(save));
    location.reload();
    return 'reloading';
  };

  const levelFor = (xp, coef = 100) => { let L = 1; while (coef * (L + 1) * L <= xp) L++; return L; };

  const __dbg = {
    // ---- saves ----
    save: () => read(),
    /** patch(s => { ...mutate s... }) then reload. */
    patch(fn) { const s = read(); if (!s) return 'no save'; fn(s); return commit(s); },
    backup(name = 'manual') { localStorage.setItem(`${KEY}.dbg.${name}`, localStorage.getItem(KEY)); return name; },
    restore(name = 'manual') {
      const raw = localStorage.getItem(`${KEY}.dbg.${name}`);
      if (!raw) return `no backup "${name}"`;
      return commit(JSON.parse(raw));
    },
    backups: () => Object.keys(localStorage).filter((k) => k.includes(`${KEY}.`)),

    // ---- player level ----
    /**
     * Jumps the player to a level. `__dbg.level(5)`, then it reloads.
     *
     * XP is the only thing that defines level (`xpForLevel` is
     * `100 * level * (level - 1)`), so this sets the exact threshold rather
     * than nudging XP until the badge changes. Reads the level back off the
     * same formula the game uses, so a wrong answer here means the formula
     * moved and this needs updating with it.
     *
     * Anything gated on level reacts on the next load - the event's own
     * level-5 gate is what this was written for. LEVEL REWARDS FOR THE LEVELS
     * YOU SKIP ARE DELIVERED on that load, which is the honest consequence of
     * arriving at a level rather than climbing to it: expect crates.
     *
     * Pass no argument to just read the current level.
     */
    level(n) {
      const xpFor = (L) => 100 * L * (L - 1);
      const s = read();
      if (!s) return 'no save';
      if (n == null) return { level: levelFor(s.orderState?.totalXp ?? 0), xp: s.orderState?.totalXp ?? 0 };
      const target = Math.max(1, Math.floor(n));
      s.orderState = s.orderState ?? {};
      s.orderState.totalXp = xpFor(target);
      if (levelFor(s.orderState.totalXp) !== target) {
        return `formula mismatch: ${xpFor(target)} xp reads as level ${levelFor(s.orderState.totalXp)}`;
      }
      return commit(s);
    },

    // ---- board setup ----
    /**
     * board({ clear:true, spawners:[['decagon',1,3,3]], items:[['decagon',1,9]], fill:'wood' })
     * Coordinates are [row, col]; items without coordinates are scattered into
     * the first free cells. Rows 7-8 are the locked expansion rows and are
     * left alone.
     */
    board(spec = {}) {
      const s = read();
      if (!s) return 'no save';
      const ROWS = 9, COLS = 7, BASE = 7;
      if (spec.clear !== false) s.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
      const free = () => { for (let r = 0; r < BASE; r++) for (let c = 0; c < COLS; c++) if (!s.grid[r][c]) return [r, c]; return null; };
      for (const [typeId, tier, r, c] of spec.spawners ?? []) {
        const at = r == null ? free() : [r, c];
        if (at) s.grid[at[0]][at[1]] = { kind: 'spawner', id: 'dbg' + Math.random().toString(36).slice(2, 7), typeId, tier, readyAt: 0, charges: 30 };
      }
      for (const [typeId, tier, count = 1] of spec.items ?? []) {
        for (let i = 0; i < count; i++) { const at = free(); if (at) s.grid[at[0]][at[1]] = { kind: 'item', typeId, tier }; }
      }
      for (const [tier, remaining] of spec.crates ?? []) {
        const at = free(); if (at) s.grid[at[0]][at[1]] = { kind: 'crate', tier, remaining };
      }
      if (spec.fill) { // fill every remaining cell but `spec.leaveFree` (default 0)
        const leave = spec.leaveFree ?? 0;
        const open = [];
        for (let r = 0; r < BASE; r++) for (let c = 0; c < COLS; c++) if (!s.grid[r][c]) open.push([r, c]);
        for (const [r, c] of open.slice(0, Math.max(0, open.length - leave))) s.grid[r][c] = { kind: 'item', typeId: spec.fill, tier: 1 };
      }
      if (spec.vault !== undefined) s.forcedSpawnVault = spec.vault;
      if (spec.xp !== undefined) s.orderState.totalXp = spec.xp;
      if (spec.boardVersion !== undefined) s.boardVersion = spec.boardVersion;
      return commit(s);
    },

    // ---- health ----
    /** The flags that gate input, plus a real frame count. See trap 3. */
    async health(ms = 1500) {
      const t0 = performance.now();
      let frames = 0;
      await new Promise((res) => {
        const tick = () => { frames++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(); };
        requestAnimationFrame(tick);
      });
      const sc = scene();
      return {
        fps: Math.round(frames / (ms / 1000)),
        // A frozen game still renders. THESE are what a freeze usually is:
        inputLocked: sc?.inputLocked, dragActive: sc?.dragActive,
        dragging: !!sc?.draggingView, modalOpen: sc?.modalOpen,
        vault: sc?.forcedSpawnVault?.length, vaultInbound: sc?.vaultInboundPending,
        vaultDelivering: sc?.vaultDeliveryPending,
        errors: __dbg.errors().length
      };
    },

    state() {
      const s = read(); const sc = scene();
      if (!s) return 'no save';
      const cells = (sc?.grid?.serialize?.() ?? s.grid).flat().filter(Boolean);
      return {
        boardVersion: s.boardVersion, xp: s.orderState?.totalXp, level: levelFor(s.orderState?.totalXp ?? 0),
        coins: s.economy?.coins, gems: s.economy?.gems, energy: s.energy?.current,
        occupied: cells.length,
        kinds: cells.reduce((a, c) => (a[c.kind] = (a[c.kind] ?? 0) + 1, a), {}),
        vault: (s.forcedSpawnVault ?? []).length, inventory: (s.inventory?.items ?? []).filter(Boolean).length,
        decagonMeter: s.rewards?.decagonMeter, autoMerge: localStorage.getItem('merge-game-auto-merge')
      };
    },

    // ---- errors that survive a reload (trap 2) ----
    watch() {
      if (window.__dbgWatching) return 'already watching';
      window.__dbgWatching = true;
      const push = (label, e) => {
        const list = __dbg.errors();
        list.push(`${label} ${new Date().toISOString().slice(11, 19)} ${String(e).slice(0, 600)}`);
        sessionStorage.setItem(ERRS, JSON.stringify(list.slice(-80)));
      };
      addEventListener('error', (e) => push('ERR', e.error?.stack ?? e.message));
      addEventListener('unhandledrejection', (e) => push('REJ', e.reason?.stack ?? e.reason));
      // Flag for the auto-arm at the bottom: it only fires if this file is
      // eval'd again after a reload, which is the limit noted in the header.
      sessionStorage.setItem('__dbg_autowatch', '1');
      return 'watching (the error LIST survives reloads; re-eval after each one to keep capturing)';
    },
    errors: () => { try { return JSON.parse(sessionStorage.getItem(ERRS)) ?? []; } catch { return []; } },
    clearErrors: () => (sessionStorage.removeItem(ERRS), 'cleared'),

    // ---- event token rate ----
    /**
     * Counts what the event token roll ACTUALLY does, rather than what the
     * constant says it should.
     *
     * Wraps the scene method at runtime, so nothing in the shipping code has
     * to carry a counter. Survives reloads through sessionStorage the same
     * way the error list does - a drop rate is only meaningful over a few
     * hundred taps, which is more than one sitting.
     *
     * This exists because a felt rate and a coded rate disagreed: the taps
     * were rolling 8% as written, but every completed order also paid a
     * guaranteed token, so the two together read as "far too many" and the
     * constant looked like it was lying.
     */
    tokens(reset = false) {
      const KEYT = '__dbg_tokens';
      const read = () => { try { return JSON.parse(sessionStorage.getItem(KEYT)) ?? { rolls: 0, dropped: 0, refused: 0 }; } catch { return { rolls: 0, dropped: 0, refused: 0 }; } };
      if (reset) { sessionStorage.removeItem(KEYT); return 'reset'; }
      const sc = scene();
      if (!sc) return 'no scene';
      if (!sc.__dbgTokenWrapped) {
        sc.__dbgTokenWrapped = true;
        const original = sc.maybeDropEventToken.bind(sc);
        sc.maybeDropEventToken = (chance) => {
          const before = [...sc.views.values()].filter((v) => v.constructor?.name === 'EventTokenView').length;
          const full = !sc.firstFreeCellInReadingOrder();
          original(chance);
          const after = [...sc.views.values()].filter((v) => v.constructor?.name === 'EventTokenView').length;
          const stats = read();
          stats.rolls++;
          if (after > before) stats.dropped += after - before;
          else if (full) stats.refused++;
          sessionStorage.setItem(KEYT, JSON.stringify(stats));
        };
      }
      const s = read();
      return {
        ...s,
        rate: s.rolls ? +(s.dropped / s.rolls).toFixed(3) : 0,
        tapsPerToken: s.dropped ? +(s.rolls / s.dropped).toFixed(1) : null,
        note: 'counting; re-eval devtools after a reload to keep counting'
      };
    },

    /** Reload without any save write, for testing load-path behaviour. */
    reload: () => (location.reload(), 'reloading')
  };

  window.__dbg = __dbg;
  if (sessionStorage.getItem('__dbg_autowatch')) __dbg.watch();
  return Object.keys(__dbg);
})();
