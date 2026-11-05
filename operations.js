/* Unit-level synthetic demonstration only: no patient rows or identifiers. */
let operationsDays = 28;
const operationsEnd = EmPATHAnalytics.addDays(currentWeekStartISO(), -1);
const operationsRows = EmPATHAnalytics.makeDemoRows(operationsEnd);
let operationsFTE = 2;
let operationsRate = 60;
function operationsTab() {
  const rows=operationsRows.slice(-operationsDays), summary=EmPATHAnalytics.summarize(rows);
  const prior=EmPATHAnalytics.summarize(operationsRows.slice(-2*operationsDays,-operationsDays));
  const number=(n,suffix='')=>n==null?'Not available':n.toFixed(1)+suffix;
  const money=n=>n==null?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  const change=(now,was,suffix)=>now==null||was==null?'No comparable prior period':`${now-was>=0?'+':''}${(now-was).toFixed(1)}${suffix} vs prior ${operationsDays} days`;
  const metric=(title,value,detail)=>`<div class="stat"><div class="n">${value}</div><div class="l">${title}</div><p class="desc">${detail}</p></div>`;
  const scenario=EmPATHAnalytics.staffingScenario(summary,operationsFTE,36,operationsRate);
  const weekly=[];
  for(let i=0;i<rows.length;i+=7) weekly.push({label:rows[i].date.slice(5),...EmPATHAnalytics.summarize(rows.slice(i,i+7))});
  return `<div class="panel"><div class="row" style="justify-content:space-between;align-items:center"><div><h2>Operational analytics</h2><p class="desc">${rows[0].date} to ${rows[rows.length-1].date} · Illustrative unit totals</p></div><div><label for="operationsDays">Reporting window</label><select id="operationsDays" onchange="operationsDays=Number(this.value);render()"><option value="7" ${operationsDays===7?'selected':''}>7 days</option><option value="28" ${operationsDays===28?'selected':''}>28 days</option></select></div></div>
  <p class="demo-notice"><strong>Synthetic demonstration.</strong> These values are generated from formulas. They are not hospital results or evidence of actual staffing outcomes. No patient-level records, diagnoses, identifiers, or clinical notes are included. Analytics use a separate illustrative dataset; editing the demonstration schedule does not change these totals.</p>
  <div class="ops-grid">
  ${metric('Average length of stay',number(summary.lengthOfStay,' h'),change(summary.lengthOfStay,prior.lengthOfStay,' h'))}
  ${metric('Average occupancy',number(summary.occupancy*100,'%'),'Patient-hours ÷ 12 staffed spaces ÷ hours in period')}
  ${metric('Nursing hours per patient day',number(summary.nhppd),change(summary.nhppd,prior.nhppd,''))}
  ${metric('Discharges',summary.discharges,'Aggregate completed stays in the selected period')}
  ${metric('Revenue per discharge',money(summary.revenuePerDischarge),'Illustrative unit revenue ÷ discharges; not billing data')}
  ${metric('Cost per discharge',money(summary.costPerDischarge),'Illustrative operating costs ÷ discharges')}
  ${metric('Higher-acuity patient-hours',number(summary.highAcuityShare*100,'%'),'Synthetic workload category, not a clinical acuity scale')}
  ${metric('Peak average census hour',fmtHour(summary.peakHour),number(summary.hourly[summary.peakHour])+' average occupants')}
  </div></div>
  <div class="panel"><h2>Census by hour</h2><p class="desc">Average unit occupancy at each hour, across the selected days. Use this view to explore when demand is concentrated.</p>${lineChartSVG([{name:'Average census',color:'#3C7A4E',values:summary.hourly}],Array.from({length:24},(_,h)=>fmtHour(h)),{max:12,min:0})}</div>
  <div class="panel"><h2>Weekly operating summary</h2><div style="overflow-x:auto"><table><thead><tr><th>Week of</th><th>Discharges</th><th>Avg stay (h)</th><th>Occupancy</th><th>NHPPD</th><th>Revenue</th><th>Cost</th></tr></thead><tbody>${weekly.map(w=>`<tr><td>${w.label}</td><td>${w.discharges}</td><td>${number(w.lengthOfStay)}</td><td>${number(w.occupancy*100,'%')}</td><td>${number(w.nhppd)}</td><td>${money(w.revenue)}</td><td>${money(w.cost)}</td></tr>`).join('')}</tbody></table></div><button class="btn secondary" onclick="exportOperations()">Download synthetic unit totals (CSV)</button></div>
  <div class="panel"><h2>Explore a staffing scenario</h2><p class="desc">Estimate the added nursing hours and cost of additional staffing. This does not predict changes to length of stay, revenue, or patient outcomes.</p><div class="row"><div><label for="operationsFTE">Additional nursing FTE</label><input id="operationsFTE" type="number" min="0" max="20" step="0.5" value="${operationsFTE}" onchange="setOperationsScenario('fte',this.value)"></div><div><label for="operationsRate">Illustrative loaded hourly cost ($)</label><input id="operationsRate" type="number" min="0" max="500" value="${operationsRate}" onchange="setOperationsScenario('rate',this.value)"></div></div><div class="ops-grid">${metric('Additional nursing hours',number(scenario.addedHours),'36 productive hours per FTE per week; no leave adjustment')}${metric('Additional period cost',money(scenario.addedCost),'Added hours × assumed loaded hourly cost')}${metric('Scenario NHPPD',number(scenario.nhppd),'Same patient-hours; additional nursing hours only')}</div></div>
  <div class="panel"><h2>Metric definitions</h2><ul class="ops-definitions"><li><strong>Average length of stay:</strong> total completed-stay hours for discharged stays divided by discharges. It is not inferred from census.</li><li><strong>Occupancy:</strong> total hourly census divided by available space-hours (12 × 24 × days).</li><li><strong>NHPPD:</strong> productive nursing hours divided by patient-hours / 24. Aides are excluded.</li><li><strong>Financial averages:</strong> unit-level illustrative revenue and cost divided by discharges. These are not individual patient costs or reimbursements.</li><li><strong>Prior period:</strong> the immediately preceding window of equal length. All averages use summed numerators and denominators, not an average of daily ratios.</li></ul></div>`;
}
function setOperationsScenario(key, raw) {
  const n=Number(raw); if(!Number.isFinite(n)||n<0) return;
  if(key==='fte') operationsFTE=Math.min(20,n); else operationsRate=Math.min(500,n);
  render();
}
function exportOperations() {
  const keys=['date','admissions','discharges','patientHours','dischargedStayHours','nursingHours','highAcuityHours','revenue','cost'];
  const csv=['data_type,'+keys.join(','),...operationsRows.slice(-operationsDays).map(r=>'SYNTHETIC_UNIT_TOTALS,'+keys.map(k=>r[k]).join(','))].join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='empath-synthetic-unit-totals.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
