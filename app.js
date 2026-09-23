
const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>(v===null||v===undefined||Number.isNaN(Number(v)))?"—":Number(v).toFixed(d);
const money=v=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(v);
const tclass=l=>`text-${l||"yellow"}`;
function card(m){
  let extra=m.secondary||"";
  if(m.change!==null&&m.change!==undefined){const a=m.change>.005?"↑":m.change<-.005?"↓":"→";extra=`${a} ${m.change>0?"+":""}${fmt(m.change,m.change_decimals??2)}${m.change_unit??m.unit??""} ${m.change_label??""}`;}
  return `<article class="card"><div class="card-top"><div><div class="label">${m.group||"SIGNAL"}</div><h3>${m.name}</h3></div><span class="signal-dot ${m.level||"yellow"}"></span></div><div class="value">${fmt(m.latest,m.decimals??2)}${m.unit||""}</div><div class="change ${tclass(m.level)}">${extra}</div><div class="why">${m.why}</div></article>`;
}
function chart(el,series,decimals=1){
  const W=640,H=245,p={l:44,r:14,t:22,b:30};
  const pts=series.flatMap(s=>s.data||[]).filter(x=>Number.isFinite(Number(x.value)));
  if(!pts.length){el.innerHTML='<div class="news-empty">No chart data available.</div>';return;}
  const dates=[...new Set(pts.map(x=>x.date))].sort(),ix=new Map(dates.map((d,i)=>[d,i]));
  let vals=pts.map(x=>Number(x.value)),lo=Math.min(...vals),hi=Math.max(...vals); if(lo===hi){lo-=1;hi+=1} const m=(hi-lo)*.12;lo-=m;hi+=m;
  const X=i=>p.l+(i/Math.max(1,dates.length-1))*(W-p.l-p.r),Y=v=>p.t+(hi-v)/(hi-lo)*(H-p.t-p.b);
  const colors=["#7eabff","#54d5e7","#b795ff","#f2ca61"]; let s=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<5;i++){let y=p.t+i*(H-p.t-p.b)/4,v=hi-i*(hi-lo)/4;s+=`<line class="grid-line" x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}"/><text class="axis-label" x="3" y="${y+3}">${v.toFixed(decimals)}</text>`;}
  series.forEach((a,j)=>{let z=(a.data||[]).filter(x=>ix.has(x.date)&&Number.isFinite(Number(x.value))).map(x=>`${X(ix.get(x.date)).toFixed(1)},${Y(Number(x.value)).toFixed(1)}`).join(" ");if(z)s+=`<polyline class="plot-line" stroke="${colors[j%colors.length]}" points="${z}"/>`;});
  [0,Math.floor((dates.length-1)/2),dates.length-1].filter((v,i,a)=>a.indexOf(v)===i).forEach(i=>s+=`<text class="axis-label" x="${X(i)-20}" y="${H-8}">${dates[i].slice(0,7)}</text>`);
  let lx=p.l;series.forEach((a,j)=>{s+=`<line x1="${lx}" y1="10" x2="${lx+16}" y2="10" stroke="${colors[j%colors.length]}" stroke-width="2"/><text class="chart-label" x="${lx+21}" y="13">${a.name}</text>`;lx+=45+a.name.length*6;});
  el.innerHTML=s+"</svg>";
}
async function load(){
  const r=await fetch(`dashboard.json?t=${Date.now()}`); if(!r.ok)throw new Error("dashboard.json unavailable"); const d=await r.json();
  $("updatedText").textContent=`Updated ${d.generated_at_display}`;$("freshnessDot").className=`dot ${d.overall.level||"neutral"}`;$("regime").textContent=d.overall.regime;$("riskBadge").textContent=`${fmt(d.overall.score,1)}/10`;$("riskBadge").className=`badge ${tclass(d.overall.level)}`;$("regimeExplanation").textContent=d.overall.explanation;$("meterFill").style.width=`${Math.max(0,Math.min(100,d.overall.score*10))}%`;
  $("cashBand").textContent=d.rule_set.band;$("cashBand").className=`hero-value ${tclass(d.rule_set.level)}`;$("cashDollars").textContent=`${money(d.rule_set.low_dollars)} – ${money(d.rule_set.high_dollars)} of ${money(d.portfolio_value)}`;$("cashExplanation").textContent=d.rule_set.explanation;
  $("cards").innerHTML=(d.metrics||[]).map(card).join("");
  chart($("usRatesChart"),[{name:"2Y",data:d.series?.us2y||[]},{name:"10Y",data:d.series?.us10y||[]},{name:"10Y real",data:d.series?.us10y_real||[]}],1);
  chart($("unemploymentChart"),[{name:"Unemployment",data:d.series?.unemployment||[]}],1);
  $("checklist").innerHTML=(d.checklist||[]).map(c=>`<div class="check"><div class="checkmark ${c.active?"text-red":"text-green"}">${c.active?"●":"○"}</div><div><strong>${c.title}</strong><p>${c.detail}</p></div></div>`).join("");
  $("news").innerHTML=(d.news&&d.news.length)?d.news.map(n=>`<article class="news-item"><div class="news-meta">${n.published_display}<br>${n.source}</div><div><a href="${n.link}" target="_blank" rel="noopener">${n.title}</a><div class="impact"><strong>Why it matters:</strong> ${n.impact}</div></div></article>`).join(""):'<div class="news-empty">No official release passed the relevance filter in the current look-back window.</div>';
  $("sourceHealth").innerHTML=(d.source_status||[]).map(s=>`<div class="source-row"><strong>${s.name}</strong><span class="${s.ok?"text-green":"text-orange"}">${s.ok?"OK":"Unavailable"}${s.note?` — ${s.note}`:""}</span></div>`).join("");
  const bad=(d.source_status||[]).filter(x=>!x.ok);if(bad.length){$("warningBox").classList.remove("hidden");$("warningBox").textContent=`Some source updates failed (${bad.map(x=>x.name).join(", ")}). Missing signals are excluded rather than replaced with invented data.`;}
}
load().catch(e=>{$("updatedText").textContent="Dashboard data unavailable";$("warningBox").classList.remove("hidden");$("warningBox").textContent="The page loaded, but the generated data file could not be read. Check the latest GitHub Actions run.";console.error(e);});
