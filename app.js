const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>(v===null||v===undefined||Number.isNaN(Number(v)))?"—":Number(v).toFixed(d);
const money=v=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(v);
const tclass=l=>`text-${l||"yellow"}`;
const STATUS={green:"Calm",yellow:"Watch",orange:"Elevated",red:"High"};

const HELP={
  "U.S. 10-Year Treasury":{
    what:"The interest rate on a 10-year U.S. government bond. It is one of the main benchmark rates used to price mortgages, corporate borrowing and investments.",
    relevance:"A fast rise tightens financial conditions and can pressure stock valuations. A high yield by itself does not mean recession.",
    read:"This card colours the speed of the move: under +0.40 pp over ~20 sessions is calm; +0.40 to +0.75 pp is watch; larger moves are elevated."
  },
  "U.S. 10-Year Real Yield":{
    what:"The 10-year Treasury yield after expected inflation is removed. Think of it as the market's inflation-adjusted return on very safe money.",
    relevance:"Higher real yields make borrowing and risky investments face a tougher hurdle, so they can pressure stocks, housing and business investment.",
    read:"Below 1.5% is calm; 1.5–2.0% watch; 2.0–2.5% elevated; 2.5%+ high."
  },
  "U.S. 10Y–2Y Curve":{
    what:"The 10-year Treasury yield minus the 2-year yield. Positive means long rates are above short rates; negative means the curve is inverted.",
    relevance:"An inverted curve has historically been a recession-warning signal, but it is poor at telling you exactly when a downturn will begin.",
    read:"Negative is a warning. Re-steepening back above zero after an inversion can also be worth watching."
  },
  "U.S. Unemployment Rate":{
    what:"The share of the U.S. labour force that is unemployed and actively looking for work.",
    relevance:"The direction matters more than the absolute number. Recessions usually involve unemployment rising from its cycle low.",
    read:"The colour is based on the dashboard's Sahm-style deterioration measure, not on 4%, 5%, etc. by itself."
  },
  "3-Month Avg Payroll Growth":{
    what:"The average number of net jobs added per month over the latest three months. '71k' means roughly 71,000 jobs per month.",
    relevance:"Using three months smooths noisy monthly reports. Falling toward zero suggests hiring momentum is fading.",
    read:"100k+ calm; 50–100k watch; 0–50k elevated; below zero high."
  },
  "U.S. CPI Inflation":{
    what:"The year-over-year change in the Consumer Price Index, a broad measure of consumer-price inflation.",
    relevance:"Inflation is not a recession signal by itself. It matters because high inflation can stop the Federal Reserve from cutting rates aggressively if growth weakens.",
    read:"Below 2.5% calm; 2.5–3.5% watch; 3.5–5% elevated; 5%+ high."
  },
  "C&I Lending Standards — Net Tightening":{
    what:"The net percentage of surveyed U.S. banks tightening lending standards for large and middle-market commercial & industrial (C&I) business loans.",
    relevance:"When banks tighten credit, businesses have a harder time borrowing. Broad tightening can amplify an economic slowdown.",
    read:"Negative means banks are easing on net. Around 0 is neutral. Above 20% is meaningful tightening; 40%+ is severe."
  },
  "Canada 10-Year Benchmark":{
    what:"The yield on Canada's benchmark 10-year federal government bond.",
    relevance:"This gives Canadian context for mortgage rates, financing conditions and CAD-denominated investments.",
    read:"It is context only and does not add points to the U.S.-led recession score. The colour reflects how fast it is moving."
  },
  "Bank of Canada Policy Rate":{
    what:"The Bank of Canada's target for the overnight rate—the key policy rate that influences short-term borrowing costs in Canada.",
    relevance:"Cuts often support borrowing and activity; hikes restrain them. The reason for a move matters—cuts during a recession are different from cuts after inflation cools.",
    read:"This is context only and does not add points to the composite score."
  }
};

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function helpMarkup(name){
  const h=HELP[name]||{};
  const body=`<strong>What it is</strong>${esc(h.what||"A dashboard indicator.")}<br><br><strong>Why it matters</strong>${esc(h.relevance||"It provides context for financial conditions.")}<br><br><strong>How to read it</strong>${esc(h.read||"Use the colour and trend together.")}`;
  return `<span class="metric-heading help-wrap"><h3>${esc(name)}</h3><button class="info-btn" type="button" aria-label="Explain ${esc(name)}" aria-expanded="false">?</button><span class="tooltip-bubble">${body}</span></span>`;
}
function card(m){
  let extra=m.secondary||"";
  if(m.change!==null&&m.change!==undefined){const a=m.change>.005?"↑":m.change<-.005?"↓":"→";extra=`${a} ${m.change>0?"+":""}${fmt(m.change,m.change_decimals??2)}${m.change_unit??m.unit??""} ${m.change_label??""}`;}
  const points=(m.points===null||m.points===undefined)?"Context only":`${m.points>0?"+":""}${fmt(m.points,1)} score`;
  return `<article class="card">
    <div class="card-top"><div><div class="label">${esc(m.group||"SIGNAL")}</div>${helpMarkup(m.name)}</div><span class="signal-dot ${m.level||"yellow"}"></span></div>
    <div class="value">${fmt(m.latest,m.decimals??2)}${esc(m.unit||"")}</div>
    <div class="change ${tclass(m.level)}">${esc(extra)}</div>
    <div class="why">${esc(m.why)}</div>
    ${m.threshold?`<div class="threshold"><strong>Watch level:</strong> ${esc(m.threshold)}</div>`:""}
    <div class="card-meta"><span class="status-pill ${tclass(m.level)}">${STATUS[m.level]||"Watch"}</span><span class="points-pill">${points}</span></div>
  </article>`;
}
function chart(el,series,decimals=1){
  const W=640,H=245,p={l:44,r:14,t:22,b:30};
  const pts=series.flatMap(s=>s.data||[]).filter(x=>Number.isFinite(Number(x.value)));
  if(!pts.length){el.innerHTML='<div class="news-empty">No chart data available.</div>';return;}
  const dates=[...new Set(pts.map(x=>x.date))].sort(),ix=new Map(dates.map((d,i)=>[d,i]));
  let vals=pts.map(x=>Number(x.value)),lo=Math.min(...vals),hi=Math.max(...vals);if(lo===hi){lo-=1;hi+=1}const m=(hi-lo)*.12;lo-=m;hi+=m;
  const X=i=>p.l+(i/Math.max(1,dates.length-1))*(W-p.l-p.r),Y=v=>p.t+(hi-v)/(hi-lo)*(H-p.t-p.b);
  const colors=["#7eabff","#54d5e7","#b795ff","#f2ca61"];let s=`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  for(let i=0;i<5;i++){let y=p.t+i*(H-p.t-p.b)/4,v=hi-i*(hi-lo)/4;s+=`<line class="grid-line" x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}"/><text class="axis-label" x="3" y="${y+3}">${v.toFixed(decimals)}</text>`;}
  series.forEach((a,j)=>{let z=(a.data||[]).filter(x=>ix.has(x.date)&&Number.isFinite(Number(x.value))).map(x=>`${X(ix.get(x.date)).toFixed(1)},${Y(Number(x.value)).toFixed(1)}`).join(" ");if(z)s+=`<polyline class="plot-line" stroke="${colors[j%colors.length]}" points="${z}"/>`;});
  [0,Math.floor((dates.length-1)/2),dates.length-1].filter((v,i,a)=>a.indexOf(v)===i).forEach(i=>s+=`<text class="axis-label" x="${X(i)-20}" y="${H-8}">${dates[i].slice(0,7)}</text>`);
  let lx=p.l;series.forEach((a,j)=>{s+=`<line x1="${lx}" y1="10" x2="${lx+16}" y2="10" stroke="${colors[j%colors.length]}" stroke-width="2"/><text class="chart-label" x="${lx+21}" y="13">${esc(a.name)}</text>`;lx+=45+a.name.length*6;});
  el.innerHTML=s+"</svg>";
}
function summaryBoxes(d){
  const metrics=d.metrics||[];
  const scoring=metrics.filter(m=>Number(m.points)>0).sort((a,b)=>Number(b.points)-Number(a.points));
  const reassuring=metrics.filter(m=>m.level==="green").slice(0,3);
  const inactive=(d.checklist||[]).filter(c=>!c.active);
  const top=scoring.length?scoring.slice(0,2).map(m=>`${m.name} (${Number(m.points).toFixed(1)} pt${Number(m.points)===1?"":"s"})`).join("; "):"No indicator is currently adding material stress points.";
  const calm=reassuring.length?reassuring.map(m=>m.name).join("; "):"Few signals are currently in the calm zone.";
  const next=inactive.length?inactive.slice(0,2).map(c=>c.title).join("; "):"Most confirmation conditions are already active.";
  return [
    ["MAIN CONCERN","What is pushing risk higher?",top],
    ["REASSURING","What is not flashing red?",calm],
    ["WATCH NEXT","What could worsen the picture?",next]
  ].map(([k,t,p])=>`<div class="summary-box"><div class="summary-kicker">${k}</div><strong>${t}</strong><p>${esc(p)}</p></div>`).join("");
}
function setupTips(){
  document.addEventListener("click",e=>{
    const b=e.target.closest(".info-btn");
    if(b){
      e.preventDefault();e.stopPropagation();
      const w=b.closest(".help-wrap"),open=w.classList.contains("tip-open");
      document.querySelectorAll(".help-wrap.tip-open").forEach(x=>{x.classList.remove("tip-open");x.querySelector(".info-btn")?.setAttribute("aria-expanded","false");});
      if(!open){w.classList.add("tip-open");b.setAttribute("aria-expanded","true");}
      return;
    }
    document.querySelectorAll(".help-wrap.tip-open").forEach(x=>{x.classList.remove("tip-open");x.querySelector(".info-btn")?.setAttribute("aria-expanded","false");});
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".help-wrap.tip-open").forEach(x=>x.classList.remove("tip-open"));});
}
async function load(){
  const r=await fetch(`dashboard.json?t=${Date.now()}`);if(!r.ok)throw new Error("dashboard.json unavailable");const d=await r.json();
  $("updatedText").textContent=`Updated ${d.generated_at_display}`;$("freshnessDot").className=`dot ${d.overall.level||"neutral"}`;$("regime").textContent=d.overall.regime;$("riskBadge").textContent=`${fmt(d.overall.score,1)}/10`;$("riskBadge").className=`badge ${tclass(d.overall.level)}`;$("regimeExplanation").textContent=d.overall.explanation;$("meterFill").style.width=`${Math.max(0,Math.min(100,d.overall.score*10))}%`;
  $("cashBand").textContent=d.rule_set.band;$("cashBand").className=`hero-value ${tclass(d.rule_set.level)}`;$("cashDollars").textContent=`${money(d.rule_set.low_dollars)} – ${money(d.rule_set.high_dollars)} of ${money(d.portfolio_value)}`;$("cashExplanation").textContent=d.rule_set.explanation;
  $("plainSummary").innerHTML=summaryBoxes(d);
  $("cards").innerHTML=(d.metrics||[]).map(card).join("");
  chart($("usRatesChart"),[{name:"2Y",data:d.series?.us2y||[]},{name:"10Y",data:d.series?.us10y||[]},{name:"10Y real",data:d.series?.us10y_real||[]}],1);
  chart($("unemploymentChart"),[{name:"Unemployment",data:d.series?.unemployment||[]}],1);
  $("checklist").innerHTML=(d.checklist||[]).map(c=>`<div class="check"><div class="checkmark ${c.active?"text-red":"text-green"}">${c.active?"●":"○"}</div><div><strong>${esc(c.title)}</strong><p>${esc(c.detail)}</p></div></div>`).join("");
  $("news").innerHTML=(d.news&&d.news.length)?d.news.map(n=>`<article class="news-item"><div class="news-meta">${esc(n.published_display)}<br>${esc(n.source)}</div><div><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="impact"><strong>Why it matters:</strong> ${esc(n.impact)}</div></div></article>`).join(""):'<div class="news-empty">No official release passed the relevance filter in the current look-back window.</div>';
  $("sourceHealth").innerHTML=(d.source_status||[]).map(s=>`<div class="source-row"><strong>${esc(s.name)}</strong><span class="${s.ok?"text-green":"text-orange"}">${s.ok?"OK":"Unavailable"}${s.note?` — ${esc(s.note)}`:""}</span></div>`).join("");
  const bad=(d.source_status||[]).filter(x=>!x.ok);if(bad.length){$("warningBox").classList.remove("hidden");$("warningBox").textContent=`Some source updates failed (${bad.map(x=>x.name).join(", ")}). Missing signals are excluded rather than replaced with invented data.`;}
  setupTips();
}
load().catch(e=>{$("updatedText").textContent="Dashboard data unavailable";$("warningBox").classList.remove("hidden");$("warningBox").textContent="The page loaded, but the generated data file could not be read. Check the latest GitHub Actions run.";console.error(e);});
