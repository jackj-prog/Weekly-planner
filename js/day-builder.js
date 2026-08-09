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
  /* Easy pace is phase-dependent (§10) — the band tightens and shifts as
     the aerobic base builds. Content lives in PLAN.easyBands, never here. */
  function easyBand(week) {
    return fromWkPick(PLAN.easyBands, week);
  }
  function easyPaceText(week) {
    return easyBand(week).band + '/km · conversational';
  }
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
          'Long-run base ' + easyBand(week).band + '/km · MP segments 5:41/km' : easyPaceText(week),
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
        detail: (quality ? TEMPO_PACE_TEXT : easyPaceText(week)) + ' · warm up 10 min easy first',
        hard: quality,
      };
    }
    const names = { tue: 'Easy run', thu: 'Easy run', sat: 'Easy buffer run' };
    const cue = PLAN.runCues && PLAN.runCues[slot];   // strides/pogos live in the data (§14)
    return {
      km, title: names[slot], shoe: 'Ghost', paceMin: pace.easy,
      detail: easyPaceText(week) + (cue ? ' · ' + cue : ''),
      hard: false,
    };
  }

  /* ---- run-log maths (pure — the app stores, this computes) ----
     EF = metres per minute ÷ average HR. The single cleanest submaximal
     fitness signal: rising EF at easy effort = aerobic gain. */
  function ef(km, sec, hr) {
    if (!(km > 0) || !(sec > 0) || !(hr > 0)) return null;
    return (km * 60000 / sec) / hr;
  }
  function paceOf(km, sec) {
    if (!(km > 0) || !(sec > 0)) return null;
    return fmtPaceSec(Math.round(sec / km));
  }
  function fmtPaceSec(s) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function parsePace(str) {                  // '6:34' → 394 s/km
    const m = String(str).match(/^(\d+):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /* Run classification for the log: which runs are comparable.
     'easy' + 'long' are the aerobic trend; 'quality' and 'race' read
     high on EF by design and are excluded from it. */
  function runClass(runBlock) {
    const t = runBlock.title || '';
    if (/TIME TRIAL|PARKRUN|MARATHON|all-out/i.test(t)) return 'race';
    if (/tempo|threshold|×|rehearsal/i.test(t)) return 'quality';
    if (runBlock.run.slot === 'long' || runBlock.run.km >= 14) return 'long';
    return 'easy';
  }

  /* Pre-filled estimate for the log steppers: centred on the runner's own
     recent history (last 3 logged runs of the same class), falling back to
     the phase band / plan paces. Ranges and steps come from PLAN.logModel
     so one data edit retunes the whole control. */
  function logEstimate(day, history) {
    if (!day.run) return null;
    const model = PLAN.logModel;
    const cls = runClass(day.run);
    const like = (history || []).filter((h) => h.cls === cls && h.paceSec > 0).slice(-3);
    const med = (arr) => {
      if (!arr.length) return null;
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    let paceSec = day.run.run.estPace ? parsePace(day.run.run.estPace) : med(like.map((h) => h.paceSec));
    if (!paceSec) {
      if (cls === 'quality') {
        const tempo = (PLAN.paces.find((p) => /tempo/i.test(p.type)) || {}).pace || '5:05–5:20';
        const mm = tempo.match(/(\d+:\d{2})–(\d+:\d{2})/);
        paceSec = mm ? Math.round((parsePace(mm[1]) + parsePace(mm[2])) / 2) : 315;
      } else {
        const band = easyBand(day.week || 1).band.split('–');
        paceSec = Math.round((parsePace(band[0]) + parsePace(band[1])) / 2);
      }
    }
    const hr = med(like.filter((h) => h.hr).map((h) => h.hr)) || model.fallbackHr[cls];
    return {
      cls, km: day.run.run.km, paceSec, hr,
      paceMin: paceSec - model.paceSpan, paceMax: paceSec + model.paceSpan,
      hrMin: hr - model.hrSpan, hrMax: hr + model.hrSpan,
      paceStep: model.paceStep, hrStep: model.hrStep,
    };
  }

  /* Next key date (§7 flags as data) — the block's decisive moments,
     always one glance away. Returns { label, iso, days } or null. */
  function nextKeyEvent(iso) {
    if (!PLAN.keyEvents) return null;
    const b = PLAN.blocks[0];
    for (const ev of PLAN.keyEvents) {
      const evIso = addDays(b.start, (ev.wk - 1) * 7 + ev.di);
      const d = daysBetween(iso, evIso);
      if (d >= 0) return { label: ev.label, iso: evIso, days: d };
    }
    return null;
  }

  /* The whole block as one shape — drives the Plan-view skyline.
     banked = ticked run km per week (same source as the Plan stats). */
  function seasonShape(getDone) {
    const block = PLAN.blocks[0];
    const keyWks = new Set((PLAN.keyEvents || []).map((e) => e.wk));
    return block.weekTable.map((row, i) => {
      const anchor = addDays(block.start, i * 7);
      let banked = 0;
      for (let d = 0; d < 7; d++) {
        const iso = addDays(anchor, d);
        const day = buildDay(iso);
        if (day.run && (getDone(iso) || {})[day.run.id]) banked += day.run.run.km;
      }
      return {
        wk: row.wk, km: row.km, lr: row.lr, phase: row.phase,
        cutback: !!row.cutback, key: keyWks.has(row.wk) || !!row.key,
        race: row.wk === block.weeks, banked: Math.round(banked * 10) / 10,
      };
    });
  }

  /* Verdict after a log: this run against the previous of its class, and
     whether it set the block's best EF for that class. list = chronological
     [{iso, cls, paceSec, hr, ef}]. */
  function logVerdict(list, iso) {
    const idx = list.findIndex((e) => e.iso === iso);
    if (idx < 0) return null;
    const cur = list[idx];
    const prev = list.slice(0, idx).reverse().find((e) => e.cls === cur.cls);
    const best = cur.ef != null &&
      list.every((e) => e.iso === iso || e.cls !== cur.cls || e.ef == null || e.ef <= cur.ef);
    if (!prev) return { first: true, best };
    return {
      first: false, best,
      dPace: prev.paceSec - cur.paceSec,             // + = quicker than last time
      dHr: cur.hr && prev.hr ? cur.hr - prev.hr : null,  // − = cheaper
    };
  }

  /* Evening runs are dark runs once the light goes (§12 rule 8). */
  function darkKitText(iso, startMin) {
    if (!PLAN.darkKit) return null;
    for (const tier of PLAN.darkKit.tiers) {
      if (iso >= tier.fromDate && startMin >= tier.afterMin) return PLAN.darkKit.text;
    }
    return null;
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

    /* Scaffold era (§16): the day's base template swaps once life changes
       (college→work Tuesdays, college→Mondays). Latest matching era
       wins; special weeks
       still override on top of whichever scaffold is live. */
    let template = block.templates[di];
    if (block.scaffolds) {
      for (const era of block.scaffolds) {
        if (week >= era.fromWk && era.days && era.days[di]) template = era.days[di];
      }
    }
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
        const dark = darkKitText(iso, start);
        const runBlock = mk(start, start + dur, {
          title: spec.title,
          detail: spec.km + ' km · ' + spec.shoe + ' · ' + spec.detail + (dark ? ' · ' + dark : ''),
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
        if (rule.none) continue;             /* era with no Saturday gym at all */
        out.push(mk(prevEnd, prevEnd + rule.mins,
          { title: rule.title, detail: rule.detail, plan: rule.plan, cat: 'gym', doable: true }));
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
      /* Saturday dinner goes carb-forward before the big MP long runs */
      if (entry.carbEve && row && week >= 14 && row.lr >= 22) {
        b.detail = (b.detail ? b.detail + ' · ' : '') + 'Carb-forward — ' + row.lr + ' km tomorrow';
      }
      /* gym → maintenance from Wk 23 (§6 deltas): swap in the reduced session */
      if (entry.gym === 'upper' && block.gymMaintenanceFromWk && week >= block.gymMaintenanceFromWk
          && !/maintenance/i.test(b.title)) {
        b.title += ' (maintenance)';
        b.detail = entry.maintDetail ||
          ((b.detail ? b.detail + ' · ' : '') + 'Reduced sets — keep the strength');
        if (entry.maintPlan) b.plan = entry.maintPlan;
      }
      /* fixed-time run blocks defined directly in data (specials, default week) */
      if (entry.runKm) {
        b.run = {
          km: entry.runKm, shoe: entry.shoe || 'Ghost', slot: 'fixed',
          hard: entry.runKm > 20 || /parkrun|marathon|all-out|time trial/i.test(b.title),
          estPace: entry.estPace || null,
        };
      }
      out.push(b);
      prevEnd = end;
    }

    out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    /* ids key the per-date ticks in localStorage. Start times are unique
       within a day (block times are strictly ordered), so time+category
       survives renames and block insertions — §14 says the plan WILL change. */
    out.forEach((b) => { b.id = 't' + b.start.replace(':', '') + '-' + b.cat; });

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
      plan: entry.plan || null,            /* structured session (gym) */
      table: entry.table || null,          /* structured pacing table (race/TT) */
      cat: entry.cat || 'routine',
      doable: !!entry.doable, quiet: !!entry.quiet,
    };
  }

  /* ---- countdown to the gun (weeks + days) ---- */
  function raceCountdown(iso) {
    const d = daysBetween(iso, PLAN.race.date);
    return { days: d, weeks: Math.floor(Math.max(0, d) / 7), rem: Math.max(0, d) % 7, past: d < 0 };
  }

  /* ==================================================================
     Adherence (pure — storage access is injected so tests can fake it).

     Counting rules, chosen for honest-but-forgiving feedback:
     · past days: every non-skipped doable counts as due; ticked = done.
     · today: only ticked items count (pending blocks neither inflate
       the denominator nor break anything — the day isn't over).
     · explicit skips are excluded entirely and never reset the run
       streak: deliberately resting per the niggle protocol is
       compliance, not failure. A silently missed past run resets it.
     ================================================================== */
  function adherence(getDone, getSkips, todayIso) {
    const b = PLAN.blocks[0];
    const total = b.weeks * 7;
    const s = {
      day: Math.max(0, Math.min(total, daysBetween(b.start, todayIso) + 1)),
      days: total,
      kmDone: 0, kmDue: 0, runsDone: 0, runsDue: 0,
      sessDone: 0, sessDue: 0, streak: 0, bestStreak: 0,
      weekKmDone: {},
    };
    if (todayIso < b.start) return s;
    let cur = 0;
    for (let i = 0; i < total; i++) {
      const iso = addDays(b.start, i);
      if (iso > todayIso) break;
      const day = buildDay(iso);
      const done = getDone(iso) || {};
      const skips = (getSkips && getSkips(iso)) || {};
      const isPast = iso < todayIso;
      for (const blk of day.blocks) {
        if (!blk.doable || skips[blk.id]) continue;
        if (done[blk.id]) { s.sessDone++; s.sessDue++; }
        else if (isPast) s.sessDue++;
      }
      const r = day.run;
      if (!r || skips[r.id]) continue;
      if (done[r.id]) {
        s.runsDone++; s.runsDue++;
        s.kmDone += r.run.km; s.kmDue += r.run.km;
        s.weekKmDone[day.week] = (s.weekKmDone[day.week] || 0) + r.run.km;
        cur++;
        if (cur > s.bestStreak) s.bestStreak = cur;
      } else if (isPast) {
        s.runsDue++; s.kmDue += r.run.km;
        cur = 0;
      }
    }
    s.streak = cur;
    return s;
  }

  /* ==================================================================
     .ics export — every doable training block (run / gym / xt) from
     fromISO to the end of the last block, as calendar events with a
     15-minute alert. Floating local times (wall-clock — right for one
     person in one timezone, DST-proof). UIDs are stable per date+block
     so re-importing updates events in place instead of duplicating.
     ================================================================== */
  function icsEscape(s) {
    return String(s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function utf8Len(ch) {
    const cp = ch.codePointAt(0);
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  /* RFC 5545 folding: lines ≤ 75 octets, continuations start with a space.
     Counted in UTF-8 bytes — em-dashes and × are multi-byte. */
  function icsFold(line) {
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const l = utf8Len(ch);
      if (bytes + l > 74) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch;
      bytes += l;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function buildICS(fromISO) {
    const first = PLAN.blocks[0];
    const last = PLAN.blocks[PLAN.blocks.length - 1];
    const start = fromISO < first.start ? first.start : fromISO;
    const endISO = addDays(last.start, last.weeks * 7 - 1);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Week OS//Training//EN',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Week OS training',
    ];
    for (let iso = start; iso <= endISO; iso = addDays(iso, 1)) {
      const day = buildDay(iso);
      for (const b of day.blocks) {
        if (!b.doable || (b.cat !== 'run' && b.cat !== 'gym' && b.cat !== 'xt')) continue;
        const d = iso.replace(/-/g, '');
        const km = b.run && (b.run.km === Math.round(b.run.km) ? b.run.km : b.run.km.toFixed(1));
        const summary = b.run && !/\d\s*km/i.test(b.title) ? b.title + ' — ' + km + ' km' : b.title;
        let desc = b.detail || '';
        if (b.plan) desc += (desc ? '\n' : '') + b.plan.map((p) => p.ex + ' ' + p.sets).join('\n');
        lines.push(
          'BEGIN:VEVENT',
          icsFold('UID:' + iso + '-' + b.id + '@week-os'),
          'DTSTAMP:' + stamp,
          'DTSTART:' + d + 'T' + b.start.replace(':', '') + '00',
          'DTEND:' + d + 'T' + b.end.replace(':', '') + '00',
          icsFold('SUMMARY:' + icsEscape(summary))
        );
        if (desc) lines.push(icsFold('DESCRIPTION:' + icsEscape(desc)));
        lines.push(
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          icsFold('DESCRIPTION:' + icsEscape(b.title)),
          'TRIGGER:-PT15M',
          'END:VALARM',
          'END:VEVENT'
        );
      }
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  /* ---- Pro 4 odometer (§11): planned outings vs the ≈50 km cap ---- */
  function pro4Status(getDone, todayIso) {
    const b = PLAN.blocks[0];
    const out = { cap: PLAN.pro4Cap, used: 0, toCome: 0, optional: 0, outings: [] };
    for (const o of PLAN.pro4Outings) {
      const iso = addDays(b.start, (o.wk - 1) * 7 + o.di);
      const day = buildDay(iso);
      const done = !!(day.run && (getDone(iso) || {})[day.run.id]);
      out.outings.push({ wk: o.wk, km: o.km, label: o.label, optional: !!o.optional, iso, done });
      if (done) out.used += o.km;
      else if (iso >= todayIso) {
        if (o.optional) out.optional += o.km;
        else out.toCome += o.km;
      }
      /* past + unticked = outing missed; it costs no bounce */
    }
    return out;
  }

  /* ---- every planned run in block one, with its outcome ---- */
  function runLog(getDone, getSkips, todayIso) {
    const b = PLAN.blocks[0];
    const log = [];
    for (let i = 0; i < b.weeks * 7; i++) {
      const iso = addDays(b.start, i);
      const day = buildDay(iso);
      if (!day.run) continue;
      const done = (getDone(iso) || {})[day.run.id];
      const skipped = getSkips && (getSkips(iso) || {})[day.run.id];
      const state = done ? 'done'
        : skipped ? 'skipped'
        : iso < todayIso ? 'missed'
        : iso === todayIso ? 'today' : 'future';
      log.push({ iso, wk: day.week, phase: day.phase, state, km: day.run.run.km });
    }
    return log;
  }

  /* Run km banked vs planned across the 7 days from anchor (any block). */
  function weekKm(getDone, anchorIso) {
    const out = { done: 0, planned: 0 };
    for (let i = 0; i < 7; i++) {
      const iso = addDays(anchorIso, i);
      const day = buildDay(iso);
      if (!day.run) continue;
      out.planned += day.run.run.km;
      if ((getDone(iso) || {})[day.run.id]) out.done += day.run.run.km;
    }
    return out;
  }

  return {
    buildDay, resolveBlock, weekNumber, dayIndex, distancesForWeek,
    weekRow, weekDates, raceCountdown, adherence, weekKm, buildICS,
    pro4Status, runLog, easyBand, ef, paceOf, nextKeyEvent,
    fmtPaceSec, parsePace, runClass, logEstimate, seasonShape, logVerdict,
    parseLocalDate, toISO, addDays, daysBetween, parseHM, fmtHM,
  };
});
