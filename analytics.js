/* Pure, dependency-free calculations for the public synthetic-data demonstration. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EmPATHAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  function addDays(iso, n) { return new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function weekStart(iso) { const dow = new Date(iso + 'T00:00:00Z').getUTCDay(); return addDays(iso, -((dow + 6) % 7)); }
  const safeDivide = (a, b) => b > 0 ? a / b : null;
  function summarize(rows, capacity = 12) {
    const sum = key => rows.reduce((n, row) => n + row[key], 0);
    const patientHours = sum('patientHours'), discharges = sum('discharges');
    const nursingHours = sum('nursingHours'), revenue = sum('revenue'), cost = sum('cost');
    const hourly = Array.from({length: 24}, (_, h) => rows.length ? rows.reduce((n, r) => n + r.hourlyCensus[h], 0) / rows.length : 0);
    return { days: rows.length, admissions: sum('admissions'), discharges, patientHours,
      averageCensus: safeDivide(patientHours, rows.length * 24),
      occupancy: safeDivide(patientHours, rows.length * capacity * 24),
      lengthOfStay: safeDivide(sum('dischargedStayHours'), discharges),
      nursingHours, nhppd: safeDivide(nursingHours, patientHours / 24),
      revenue, cost, margin: revenue - cost,
      revenuePerDischarge: safeDivide(revenue, discharges), costPerDischarge: safeDivide(cost, discharges),
      highAcuityShare: safeDivide(sum('highAcuityHours'), patientHours),
      hourly, peakHour: rows.length ? hourly.indexOf(Math.max(...hourly)) : null };
  }
  function makeDemoRows(endDate, days = 56) {
    return Array.from({length: days}, (_, i) => {
      const date = addDays(endDate, i - days + 1);
      const hourlyCensus = Array.from({length:24}, (_, h) => Math.min(12, Math.max(2,
        Math.round(6 + Math.sin((h - 7) * Math.PI / 12) * 2 + (i % 7) * .45))));
      const patientHours = hourlyCensus.reduce((a,b)=>a+b,0);
      const discharges = 5 + i % 4, nursingHours = 72 + (i % 3) * 4;
      return {date, admissions:discharges + (i % 3 - 1), discharges, patientHours,
        dischargedStayHours:discharges * (20 + (i % 9) * 1.25), hourlyCensus,
        highAcuityHours:Math.round(patientHours * (.18 + (i % 5) * .025)),
        nursingHours, revenue:discharges * (1350 + (i % 4) * 75),
        cost:nursingHours * 52 + 1100 + (i % 6) * 90, synthetic:true};
    });
  }
  function staffingScenario(summary, addedFTE, hoursPerFTE, hourlyCost) {
    if (![addedFTE,hoursPerFTE,hourlyCost].every(Number.isFinite) || addedFTE < 0 || hoursPerFTE <= 0 || hourlyCost < 0) throw new RangeError('Use nonnegative FTE and cost, and positive hours per FTE.');
    const addedHours = addedFTE * hoursPerFTE * summary.days / 7;
    return {addedHours, addedCost:addedHours * hourlyCost,
      nhppd:safeDivide(summary.nursingHours + addedHours, summary.patientHours / 24)};
  }
  // Attribute pay to each calendar hour. Overtime resets on Monday and includes
  // earlier hours in the same week even when the requested reporting range is partial.
  // This is a planning estimate, not a payroll compliance engine.
  function laborCost(assignments, nurses, dates, budget, overtimeThreshold = 40, holidays = []) {
    const staff = new Map(nurses.map(n=>[n.id,n])); const worked = new Map(); let total = 0;
    const slices = [];
    for (const a of assignments) {
      if (!staff.has(a.nurseId) || !Number.isFinite(a.start) || !Number.isFinite(a.duration) || a.duration <= 0) continue;
      for(let offset=0; offset<a.duration; offset+=1) {
        const absolute=a.start+offset, date=addDays(a.date,Math.floor(absolute/24));
        slices.push({id:a.nurseId,date,hour:absolute%24,hours:Math.min(1,a.duration-offset)});
      }
    }
    slices.sort((a,b)=>a.date.localeCompare(b.date)||a.hour-b.hour);
    for(const slice of slices) {
      const n=staff.get(slice.id), key=slice.id+'|'+weekStart(slice.date), prev=worked.get(key)||0;
      const regular=Math.min(slice.hours,Math.max(0,overtimeThreshold-prev));
      worked.set(key,prev+slice.hours);
      if(!dates.has(slice.date)) continue;
      const dow=new Date(slice.date+'T00:00:00Z').getUTCDay();
      const base=n.role==='Manager'?budget.mgrWage:n.role==='Aide'?(budget.aideWage??budget.rnWage):budget.rnWage;
      const differential=(slice.hour>=19||slice.hour<7||dow===0||dow===6?budget.diffPct:0)+(holidays.includes(slice.date)?budget.holidayDiffPct:0);
      total+=(regular+(slice.hours-regular)*1.5)*base*(1+differential/100);
    }
    return total;
  }
  return {addDays, weekStart, summarize, makeDemoRows, staffingScenario, laborCost};
});
