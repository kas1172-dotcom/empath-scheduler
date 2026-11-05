const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../analytics.js');
const budget={rnWage:10,mgrWage:20,aideWage:5,diffPct:0,holidayDiffPct:0};
const nurses=[{id:'n',role:'RN'}];
const shift=(date,duration=10,start=7)=>({nurseId:'n',date,start,duration});
test('overtime resets each Monday across a multiweek report',()=>{
 const dates=Array.from({length:14},(_,i)=>A.addDays('2026-10-05',i));
 const shifts=[0,1,2,3,4,7,8,9,10,11].map(i=>shift(dates[i]));
 assert.equal(A.laborCost(shifts,nurses,new Set(dates),budget),1100);
});
test('partial report counts preceding hours toward weekly overtime',()=>{
 const shifts=[0,1,2,3,4].map(i=>shift(A.addDays('2026-10-05',i)));
 assert.equal(A.laborCost(shifts,nurses,new Set(['2026-10-09']),budget),150);
});
test('overnight Sunday shift splits across workweeks and calendar dates',()=>{
 assert.equal(A.laborCost([shift('2026-10-11',12,19)],nurses,new Set(['2026-10-12']),budget),70);
});
test('aide costs use their configured rate',()=>{
 assert.equal(A.laborCost([shift('2026-10-05')],[{id:'n',role:'Aide'}],new Set(['2026-10-05']),budget),50);
});
test('empty denominators are unavailable, never NaN or Infinity',()=>{
 const s=A.summarize([]); assert.equal(s.nhppd,null); assert.equal(s.lengthOfStay,null); assert.equal(s.occupancy,null);
 assert.equal(JSON.stringify(s).includes('NaN'),false);
});
test('metrics use weighted totals rather than average daily ratios',()=>{
 const rows=A.makeDemoRows('2026-11-01',2);
 rows[0].discharges=1;rows[0].dischargedStayHours=10;
 rows[1].discharges=9;rows[1].dischargedStayHours=270;
 const s=A.summarize(rows);assert.equal(s.lengthOfStay,28);
 assert.equal(s.nhppd,(rows[0].nursingHours+rows[1].nursingHours)/(s.patientHours/24));
});
test('demo generator is deterministic, aggregate-only, and within capacity',()=>{
 const rows=A.makeDemoRows('2026-11-01'); assert.deepEqual(rows,A.makeDemoRows('2026-11-01'));
 assert.equal(rows.length,56);
 for(const row of rows){assert.equal(row.synthetic,true);assert.equal(row.hourlyCensus.length,24);assert.ok(row.hourlyCensus.every(n=>n>=0&&n<=12));assert.equal(row.patientHours,row.hourlyCensus.reduce((a,b)=>a+b,0));assert.ok(!('patientId' in row));}
});
test('staffing scenarios change hours and costs without inventing outcomes',()=>{
 const s=A.summarize(A.makeDemoRows('2026-11-01',28));const out=A.staffingScenario(s,2,36,60);
 assert.equal(out.addedHours,288);assert.equal(out.addedCost,17280);assert.ok(out.nhppd>s.nhppd);
 assert.throws(()=>A.staffingScenario(s,-1,36,60),RangeError);
});

test('partial periods use observed days and retain recorded zero census',()=>{
 const buckets=A.censusPeriods({'2026-10-01':{day:0,night:0},'2026-10-02':{day:10,night:6},'2026-10-03':{day:null,night:2}},'month');
 assert.equal(buckets.length,1);assert.deepEqual(buckets[0].dates,['2026-10-01','2026-10-02']);assert.equal(buckets[0].avgDay,5);assert.equal(buckets[0].avgNight,3);
});
