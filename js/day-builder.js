/* ==========================================================================
   Week OS — js/day-builder.js
   Pure functions: date + PLAN → a fully resolved day. No plan content
   lives here; no DOM. Shared by the app (browser) and tests (Node).
   ========================================================================== */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../data/plan.js'));
  } else {
    /* top-level `const PLAN` lives in the global lexical scope, not on window */
    root.DayBuilder = factory(typeof PLAN !== 'undefined' ? PLAN : root.PLAN);
  }
})(typeof self !== 'undefined' ? self : this, function (PLAN) {
  'use strict';

  const DAY_MS = 86400000;

  /* ---- date helpers (all local-time) ---- */
  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);           // local midnight
  }
  function toISO(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }
  function addDays(iso, n) {
    const d = parseLocalDate(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  /* Whole days between two local midnights; Math.round absorbs DST hours. */
  function daysBetween(fromISO, toISOStr) {
    return Math.round((parseLocalDate(toISOStr) - parseLocalDate(fromISO)) / DAY_MS);
  }
  function dayIndex(iso) {                    // Mon=0 … Sun=6
    return (parseLocalDate(iso).getDay() + 6) % 7;
  }
  function parseHM(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function fmtHM(mins) {
    const p = (n) => String(n).padStart(2, '0');
    return p(Math.floor(mins / 60)) + ':' + p(mins % 60);
  }

  /* ---- block resolution (§14) ----
     Dates before block one and after the last block resolve to defaultWeek. */
  function resolveBlock(iso) {
    for (const block of PLAN.blocks) {
      const d = daysBetween(block.start, iso);
      if (d >= 0 && d < block.weeks * 7) {
        return { block, week: Math.min(block.weeks, Math.floor(d / 7) + 1) };
      }
    }
    return { block: null, week: null };
  }

  /* Week number in block one for an arbitrary date (clamped 1–30, §2). */
  function weekNumber(iso) {
    const b = PLAN.blocks[0];
    return Math.max(1, Math.min(b.weeks, Math.floor(daysBetween(b.start, iso) / 7) + 1));
  }

  function weekRow(block, week) {
    return (block.weekTable && block.weekTable[week - 1]) || null;
  }
  function weekDates(block, week) {
    const start = addDays(block.start, (week - 1) * 7);
    return { start, end: addDays(start, 6) };
  }

  /* ---- daily distance algorithm (§8) ---- */
  function distancesForWeek(row) {
    const s = PLAN.split;
    const rest = row.km - row.lr;
    let wed = Math.max(s.minKm, Math.round(rest * s.wed));
    let tue = Math.max(s.minKm, Math.round(rest * s.tue));
    let thu = Math.max(s.minKm, Math.round(rest * s.thu));
    let sat = rest - wed - tue - thu;
    if (sat < s.minKm) { tue += Math.max(0, sat); sat = 0; }
    return { tue, wed, thu, sat, long: row.lr };
  }

  /* ---- rule lookups keyed on "fromWk" lists ---- */
  function fromWkPick(list, week) {
    let hit = list[0];
    for (const item of list) if (week >= item.fromWk) hit = item;
    return hit;
  }

  /* ---- run block construction ---- */
  const EASY_PACE_TEXT = '6:20–6:50/km · conversational';
  const TEMPO_PACE_TEXT = 'Tempo 5:05–5:20/km';

  function isQuality(session) {
    return /tempo|threshold|mp|×/i.test(session || '');
  }

  function runSpec(slot, row, km, week, iso) {
    const pace = PLAN.pacing;
    if (slot === 'long') {
      const spec = {
        km, title: row.sun || 'Long run', shoe: row.lrShoe || 'Ghost',
        paceMin: pace.long,
        detail: /MP|REHEARSAL|PEAK/i.test(row.sun || '') ?
          'Long-run base 6:20–6:50/km · MP segments 5:41/km' : EASY_PACE_TEXT,
        hard: true,
      };
      const durMin = Math.ceil(km * pace.long);
      if (iso >= PLAN.gels.fromDate && durMin > PLAN.gels.minRunMin) {
        spec.detail += ' · ' + PLAN.gels.text;
      }
      return spec;
    }
    if (slot === 'wed') {
      const quality = isQuality(row.wed);
      return {
        km, title: quality ? 'Quality run — ' + row.wed : (row.wed || 'Easy run'),
        shoe: row.wedShoe || 'Evo SL',
        paceMin: pace.quality,
        detail: (quality ? TEMPO_PACE_TEXT : EASY_PACE_TEXT) + ' · warm up 10 min easy first',
        hard: quality,
      };
    }
    const names = { tue: 'Easy run', thu: 'Easy run', sat: 'Easy buffer run' };
    return { km, title: names[slot], shoe: 'Ghost', paceMin: pace.easy, detail: EASY_PACE_TEXT, hard: false };
  }

  /* ==================================================================
     buildDay(iso) → {
       iso, dayIndex, blockId, blockName, week, phase, row, label,
       blocks: [{ id, start, end, startMin, endMin, title, detail, cat,
                  doable, quiet, run:{km,shoe}, hero }],
       run: hero run block or null
     }
     ================================================================== */
  function buildDay(iso) {
    const di = dayIndex(iso);
    const { block, week } = resolveBlock(iso);

    if (!block) return assemble(iso, di, PLAN.defaultWeek, null, null, PLAN.defaultWeek.templates[di], null);

    const row = weekRow(block, week);
    const special = (block.specialWeeks || {})[week] || null;
    const dayOverride = special && special.days ? special.days[di] : null;

    let template = block.templates[di];
    if (dayOverride && dayOverride.blocks) {
      template = typeof dayOverride.blocks === 'string'
        ? block.namedTemplates[dayOverride.blocks]
        : dayOverride.blocks;
    }
    return assemble(iso, di, block, week, row, template, dayOverride, special);
  }

  function assemble(iso, di, block, week, row, template, dayOverride, special) {
    const pace = PLAN.pacing;
    const dist = row ? distancesForWeek(row) : null;
    const out = [];
    let prevEnd = 0;

    for (const entry of template) {
      /* recovery-block "week 2 only" blocks */
      if ((entry.recoveryWk2Run || entry.recoveryWk2Gym) && week !== 2) continue;
      /* basketball drops out on flagged weeks */
      if (entry.basketball && row && row.noBasketball) continue;

      if (entry.run) {                       /* computed run slot */
        if (dayOverride && dayOverride.noRun) {
          out.push(mk(parseHM(entry.t), parseHM(entry.t) + 30,
            { title: 'REST — no run today', detail: dayOverride.note || 'Planned rest', cat: 'free', quiet: true }));
          prevEnd = out[out.length - 1].endMin;
          continue;
        }
        const slotKm = dist ? dist[entry.run] : 0;
        const patch = (dayOverride && dayOverride.run) || {};
        const spec = runSpec(entry.run, row, patch.km != null ? patch.km : slotKm, week, iso);
        if (patch.title) spec.title = patch.title;
        if (patch.shoe) spec.shoe = patch.shoe;
        if (patch.detail) spec.detail = patch.detail;
        if (patch.detailExtra) spec.detail += ' · ' + patch.detailExtra;

        if (spec.km <= 0) {                  /* Sat = 0 → full rest before LR */
          out.push(mk(parseHM(entry.t), parseHM(entry.t) + 30,
            { title: 'No run — full rest before the long run', cat: 'free', quiet: true }));
          prevEnd = out[out.length - 1].endMin;
          continue;
        }
        const start = parseHM(entry.t);
        const dur = Math.ceil(spec.km * spec.paceMin);
        const runBlock = mk(start, start + dur, {
          title: spec.title,
          detail: spec.km + ' km · ' + spec.shoe + ' · ' + spec.detail,
          cat: 'run', doable: true,
        });
        runBlock.run = { km: spec.km, shoe: spec.shoe, slot: entry.run, hard: spec.hard };
        out.push(runBlock);
        out.push(mk(start + dur, start + dur + pace.showerMin, { title: 'Shower', cat: 'routine', quiet: true }));
        prevEnd = start + dur + pace.showerMin;
        continue;
      }

      if (entry.satGym) {                    /* Saturday gym variant (§6 deltas) */
        if (dayOverride && dayOverride.noGym) continue;
        const rule = fromWkPick(block.satGym, week);
        out.push(mk(prevEnd, prevEnd + rule.mins,
          { title: rule.title, detail: rule.detail, cat: 'gym', doable: true }));
        prevEnd = out[out.length - 1].endMin;
        continue;
      }

      let start = entry.after ? prevEnd : parseHM(entry.t);
      let end = entry.end ? parseHM(entry.end) : (entry.mins ? start + entry.mins : start + 30);

      /* Friday German block end time is a phase delta */
      if (entry.friGerman && block.friGermanEnd) {
        end = parseHM(fromWkPick(block.friGermanEnd, week).end);
      }
      if (end <= start) continue;            /* squeezed out — drop it */

      const b = mk(start, end, entry);
      /* gym → maintenance from Wk 23 (§6 deltas) */
      if (entry.gym === 'upper' && block.gymMaintenanceFromWk && week >= block.gymMaintenanceFromWk
          && !/maintenance/i.test(b.title)) {
        b.title += ' (maintenance)';
        b.detail = (b.detail ? b.detail + ' · ' : '') + 'Reduced sets — keep the strength';
      }
      /* fixed-time run blocks defined directly in data (specials, default week) */
      if (entry.runKm) {
        b.run = {
          km: entry.runKm, shoe: entry.shoe || 'Ghost', slot: 'fixed',
          hard: entry.runKm > 20 || /parkrun|marathon|all-out/i.test(b.title),
        };
      }
      out.push(b);
      prevEnd = end;
    }

    out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    out.forEach((b, i) => { b.id = 'b' + i + '-' + slug(b.title); });

    const runHero = out.find((b) => b.run && b.cat === 'run') || null;

    return {
      iso, dayIndex: di,
      blockId: block.id, blockName: block.name,
      week, phase: row ? row.phase : null, row,
      label: special ? special.label : (row && row.notes ? row.notes : (block.note || '')),
      dist, blocks: out, run: runHero,
    };
  }

  function mk(startMin, endMin, entry) {
    return {
      startMin, endMin,
      start: fmtHM(startMin), end: fmtHM(Math.min(endMin, 1439)),
      title: entry.title, detail: entry.detail || '',
      cat: entry.cat || 'routine',
      doable: !!entry.doable, quiet: !!entry.quiet,
    };
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  }

  /* ---- countdown to the gun (weeks + days) ---- */
  function raceCountdown(iso) {
    const d = daysBetween(iso, PLAN.race.date);
    return { days: d, weeks: Math.floor(Math.max(0, d) / 7), rem: Math.max(0, d) % 7, past: d < 0 };
  }

  return {
    buildDay, resolveBlock, weekNumber, dayIndex, distancesForWeek,
    weekRow, weekDates, raceCountdown,
    parseLocalDate, toISO, addDays, daysBetween, parseHM, fmtHM,
  };
});
