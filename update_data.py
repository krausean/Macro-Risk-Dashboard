#!/usr/bin/env python3
from __future__ import annotations
import csv, io, json, re, time
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/"config.json").read_text(encoding="utf-8"))
OUT=ROOT/"dashboard.json"
HEADERS={"User-Agent":"PersonalMacroRiskDashboard/2.0 (non-commercial educational use)"}

def req(method,url,timeout=45,retries=4,**kwargs):
    last=None
    for i in range(retries):
        try:
            r=requests.request(method,url,headers=HEADERS,timeout=timeout,**kwargs);r.raise_for_status();return r
        except (requests.exceptions.Timeout,requests.exceptions.ConnectionError) as e:
            last=e
            if i<retries-1: time.sleep(2**(i+1))
    raise last
def get(url,**kw): return req("GET",url,**kw)
def post(url,**kw): return req("POST",url,**kw)

def num(v):
    try:
        s=str(v).strip().replace(",","")
        if s.lower() in {"","n/a","na","nd",".","null","none"}: return None
        return float(s)
    except: return None

def chg(a,n=20):
    return None if len(a)<=n else a[-1]["value"]-a[-1-n]["value"]

def lvl(v,stops):
    if v is None:return "yellow"
    for top,name in stops:
        if v<top:return name
    return stops[-1][1]

def treasury_csv(kind,year):
    return f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?_format=csv&field_tdr_date_value={year}&page=&type={kind}"

def fetch_treasury(kind,years,columns):
    rows=[]
    for year in years:
        txt=get(treasury_csv(kind,year)).text
        reader=csv.DictReader(io.StringIO(txt))
        for r in reader:
            date=(r.get("Date") or "").strip()
            if not date:continue
            try: iso=datetime.strptime(date,"%m/%d/%Y").date().isoformat()
            except: continue
            item={"date":iso}
            for c in columns:item[c]=num(r.get(c))
            rows.append(item)
    dedup={r["date"]:r for r in rows}
    return [dedup[k] for k in sorted(dedup)]

def fetch_bls():
    y=datetime.now(timezone.utc).year
    payload={"seriesid":["LNS14000000","CES0000000001","CUUR0000SA0"],"startyear":str(y-3),"endyear":str(y)}
    d=post("https://api.bls.gov/publicAPI/v2/timeseries/data/",json=payload).json()
    if d.get("status")!="REQUEST_SUCCEEDED": raise RuntimeError("BLS API request failed")
    out={}
    for s in d["Results"]["series"]:
        a=[]
        for x in s["data"]:
            p=x.get("period","")
            if not re.fullmatch(r"M(0[1-9]|1[0-2])",p):continue
            date=f'{int(x["year"]):04d}-{int(p[1:]):02d}-01';v=num(x.get("value"))
            if v is not None:a.append({"date":date,"value":v})
        out[s["seriesID"]]=sorted(a,key=lambda z:z["date"])
    return out

def sahm_style(u):
    vals=[x["value"] for x in u]
    if len(vals)<15:return None
    avgs=[sum(vals[i-2:i+1])/3 for i in range(2,len(vals))]
    return avgs[-1]-min(avgs[-13:])

def payroll3(p):
    vals=[x["value"] for x in p]
    if len(vals)<4:return None
    ds=[vals[i]-vals[i-1] for i in range(1,len(vals))]
    return sum(ds[-3:])/3

def cpi_yoy(c):
    if len(c)<13:return None
    return (c[-1]["value"]/c[-13]["value"]-1)*100

def latest_sloos_release():
    page="https://www.federalreserve.gov/data/sloos.htm"
    soup=BeautifulSoup(get(page).text,"html.parser")
    links=[]
    for a in soup.find_all("a",href=True):
        m=re.search(r"/data/sloos/sloos-(\d{6})\.htm$",a["href"],re.I)
        if m:links.append((m.group(1),urljoin(page,a["href"])))
    if not links:raise RuntimeError("Latest SLOOS link not found")
    return max(links,key=lambda x:x[0])[1]

def fetch_sloos():
    release=latest_sloos_release()
    chart=release.replace(".htm","-chart-data.htm")
    soup=BeautifulSoup(get(chart).text,"html.parser")
    # Figure 1 first data table: Period, large/medium tightening, small tightening, ...
    for table in soup.find_all("table"):
        text=table.get_text(" ",strip=True).lower()
        if "net percentage" not in text or "tightening standards" not in text or "c&i" not in text: continue
        out=[]
        for tr in table.find_all("tr"):
            cells=[c.get_text(" ",strip=True) for c in tr.find_all(["th","td"])]
            if len(cells)<3:continue
            if not re.fullmatch(r"\d{4}:\d",cells[0].replace(" ","")):continue
            v=num(cells[1])
            if v is not None:out.append({"period":cells[0].strip(),"value":v})
        if len(out)>=20:return out,release
    raise RuntimeError("SLOOS chart table could not be parsed")

def fetch_boc(series):
    start=(datetime.now(timezone.utc)-timedelta(days=800)).date().isoformat()
    d=get(f"https://www.bankofcanada.ca/valet/observations/{series}/json?start_date={start}").json()
    a=[]
    for x in d.get("observations",[]):
        v=num((x.get(series) or {}).get("v"))
        if v is not None:a.append({"date":x["d"],"value":v})
    if not a:raise RuntimeError(f"No Bank of Canada observations for {series}")
    return a

def rss(url,source):
    root=ET.fromstring(get(url).content);out=[]
    for it in root.findall(".//item"):
        title=(it.findtext("title") or "").strip();link=(it.findtext("link") or "").strip();pub=(it.findtext("pubDate") or "").strip()
        try:dt=parsedate_to_datetime(pub).astimezone(timezone.utc)
        except:dt=datetime.now(timezone.utc)
        out.append({"title":title,"link":link,"source":source,"dt":dt})
    return out

def cats(title):
    t=title.lower();c=[]
    if any(k in t for k in ["interest rate","policy rate","monetary policy","fomc","federal funds"]):c.append("rates")
    if any(k in t for k in ["employment situation","unemployment","payroll","job openings","labor","labour"]):c.append("labour")
    if any(k in t for k in ["consumer price","inflation","cpi","prices"]):c.append("inflation")
    if any(k in t for k in ["loan officer","lending","credit","financial stability"]):c.append("credit")
    if any(k in t for k in ["gdp","economic outlook","recession","economy"]):c.append("growth")
    return c

def why_news(c):
    p=[]
    if "credit" in c:p.append("Tighter lending can restrict financing and is especially meaningful when labour data weaken too.")
    if "labour" in c:p.append("Employment and income support household spending and corporate earnings, so deterioration is an important confirmation signal.")
    if "rates" in c:p.append("Policy changes affect financing costs and government yields; the reason for the move matters more than the headline alone.")
    if "inflation" in c:p.append("Persistent inflation can limit how aggressively central banks can ease during a slowdown.")
    if "growth" in c:p.append("Growth releases help distinguish high yields caused by resilience from conditions that are beginning to damage activity.")
    return " ".join(p[:2])

def news():
    feeds=[
      ("https://www.federalreserve.gov/feeds/press_monetary.xml","Federal Reserve"),
      ("https://www.federalreserve.gov/feeds/sloos.xml","Federal Reserve SLOOS"),
      ("https://www.bls.gov/feed/bls_latest.rss","U.S. BLS"),
      ("https://www.bankofcanada.ca/content_type/press-releases/feed/","Bank of Canada")]
    cutoff=datetime.now(timezone.utc)-timedelta(days=int(CONFIG.get("news_lookback_days",14)));items=[]
    for url,source in feeds:
        try:
            for x in rss(url,source):
                c=cats(x["title"])
                if c and x["dt"]>=cutoff:items.append({"title":x["title"],"link":x["link"],"source":source,"published":x["dt"].isoformat(),"published_display":x["dt"].strftime("%b %d, %Y"),"impact":why_news(c),"w":len(c)})
        except:pass
    d={x["title"]:x for x in items};a=sorted(d.values(),key=lambda x:(x["w"],x["published"]),reverse=True)[:7]
    for x in a:x.pop("w",None)
    return a

def metric(name,group,v,unit,level,why,change=None,change_unit=None,change_label="",decimals=2,secondary=None):
    return {"name":name,"group":group,"latest":v,"unit":unit,"level":level,"why":why,"change":change,"change_unit":change_unit if change_unit is not None else unit,"change_label":change_label,"decimals":decimals,"secondary":secondary}

def band(score):
    for b in CONFIG["score_bands"]:
        if score<b["max_score"]:return b
    return CONFIG["score_bands"][-1]

def main():
    now=datetime.now(timezone.utc);score=0.0;metrics=[];series={"us2y":[],"us10y":[],"us10y_real":[],"unemployment":[]};status=[];facts={}
    # Treasury
    try:
        yrs=[now.year-1,now.year]
        nom=fetch_treasury("daily_treasury_yield_curve",yrs,["2 Yr","10 Yr"])
        real=fetch_treasury("daily_treasury_real_yield_curve",yrs,["10 YR"])
        u2=[{"date":r["date"],"value":r["2 Yr"]} for r in nom if r["2 Yr"] is not None]
        u10=[{"date":r["date"],"value":r["10 Yr"]} for r in nom if r["10 Yr"] is not None]
        r10=[{"date":r["date"],"value":r["10 YR"]} for r in real if r["10 YR"] is not None]
        series["us2y"]=u2[-300:];series["us10y"]=u10[-300:];series["us10y_real"]=r10[-300:]
        d2={x["date"]:x["value"] for x in u2};curves=[{"date":x["date"],"value":x["value"]-d2[x["date"]]} for x in u10 if x["date"] in d2]
        curve=curves[-1]["value"];recent=[x["value"] for x in curves[-126:]];resteep=bool(recent and min(recent)<0 and curve>=0)
        realv=r10[-1]["value"];move=chg(u10,20)
        score+=1.5 if realv>=2.5 else 1 if realv>=2 else .5 if realv>=1.5 else 0
        score+=1 if move is not None and move>=.75 else .5 if move is not None and move>=.4 else 0
        score+=.5 if resteep or curve<0 else 0
        metrics += [
          metric("U.S. 10-Year Treasury","RATES",u10[-1]["value"],"%",lvl(abs(move or 0),[(.4,"green"),(.75,"yellow"),(99,"orange")]),"Watch the speed and cause of the move; a high yield by itself is not a recession signal.",move," pp","/~20 sessions"),
          metric("U.S. 10-Year Real Yield","RATES",realv,"%",lvl(realv,[(1.5,"green"),(2,"yellow"),(2.5,"orange"),(99,"red")]),"A high real yield raises the inflation-adjusted hurdle rate for borrowing and asset valuations.",chg(r10,20)," pp","/~20 sessions"),
          metric("U.S. 10Y–2Y Curve","CURVE",curve," pp","yellow" if curve<0 or resteep else "green","An inversion is a cycle-warning signal; re-steepening after inversion can also merit attention.",secondary="Re-steepened after inversion" if resteep else "Inverted" if curve<0 else "Positive slope")]
        facts.update(curve=curve,resteep=resteep,real10=realv,us10move=move);status.append({"name":"U.S. Treasury","ok":True,"note":"official daily-rate CSV"})
    except Exception as e:status.append({"name":"U.S. Treasury","ok":False,"note":str(e)[:90]})
    # BLS
    try:
        b=fetch_bls();u=b["LNS14000000"];p=b["CES0000000001"];c=b["CUUR0000SA0"];series["unemployment"]=u[-60:]
        s=sahm_style(u);pg=payroll3(p);inf=cpi_yoy(c)
        score+=3 if s>=.5 else 2 if s>=.3 else 1 if s>=.2 else 0
        score+=2 if pg<0 else 1 if pg<50 else .5 if pg<100 else 0
        score+=1 if inf>=3.5 else .5 if inf>=2.5 else 0
        metrics += [
          metric("U.S. Unemployment Rate","LABOUR",u[-1]["value"],"%",lvl(s,[(.2,"green"),(.3,"yellow"),(.5,"orange"),(99,"red")]),"The dashboard emphasizes deterioration from the cycle low, not whether unemployment merely looks high or low.",secondary=f"Sahm-style deterioration: {s:.2f} pp"),
          metric("3-Month Avg Payroll Growth","LABOUR",pg,"k",lvl(pg,[(0,"red"),(50,"orange"),(100,"yellow"),(1e9,"green")]),"A sustained move toward zero or negative payroll growth confirms that weakness is reaching employment.",decimals=0,secondary="Average monthly change"),
          metric("U.S. CPI Inflation","INFLATION",inf,"%",lvl(inf,[(2.5,"green"),(3.5,"yellow"),(5,"orange"),(99,"red")]),"Higher inflation can constrain policy easing during a slowdown.",decimals=1,secondary="Year over year")]
        facts.update(sahm=s,payroll3=pg,cpi=inf);status.append({"name":"U.S. BLS","ok":True,"note":"public API"})
    except Exception as e:status.append({"name":"U.S. BLS","ok":False,"note":str(e)[:90]})
    # SLOOS
    try:
        a,release=fetch_sloos();tight=a[-1]["value"]
        score+=3 if tight>=40 else 2 if tight>=20 else 1 if tight>=10 else .5 if tight>0 else 0
        metrics.append(metric("Banks Tightening C&I Standards","CREDIT",tight,"%",lvl(tight,[(.1,"green"),(10,"yellow"),(20,"orange"),(999,"red")]),"Net share of domestic banks tightening standards for large/middle-market C&I loans; useful quarterly confirmation rather than a daily timing tool.",secondary=a[-1]["period"]))
        facts["sloos"]=tight;status.append({"name":"Federal Reserve SLOOS","ok":True,"note":"latest official survey"})
    except Exception as e:status.append({"name":"Federal Reserve SLOOS","ok":False,"note":str(e)[:90]})
    # Canada
    try:
        ca10=fetch_boc("V39055");boc=fetch_boc("V39079")
        metrics += [
          metric("Canada 10-Year Benchmark","CANADA",ca10[-1]["value"],"%",lvl(abs(chg(ca10,20) or 0),[(.35,"green"),(.6,"yellow"),(99,"orange")]),"Canadian long yields add local financing context for a CAD-denominated household and RRSP.",chg(ca10,20)," pp","/~20 observations"),
          metric("Bank of Canada Policy Rate","CANADA",boc[-1]["value"],"%","green","Policy rate is context for Canadian borrowing costs; direction and reason matter more than the absolute level.",secondary="Target overnight rate")]
        status.append({"name":"Bank of Canada","ok":True,"note":"Valet API"})
    except Exception as e:status.append({"name":"Bank of Canada","ok":False,"note":str(e)[:90]})
    score=min(10,score);b=band(score);P=float(CONFIG["portfolio_value"])
    bits=[]
    if facts.get("sahm") is not None:bits.append(f"labour deterioration {facts['sahm']:.2f} pp")
    if facts.get("sloos") is not None:bits.append(f"C&I tightening {facts['sloos']:.1f}%")
    if facts.get("real10") is not None:bits.append(f"10Y real yield {facts['real10']:.2f}%")
    explanation="Composite score uses only source groups that refreshed successfully today. "+(("Key readings: "+", ".join(bits)+". ") if bits else "")+"No single yield or headline is treated as a recession call."
    checks=[
      {"title":"Labour deterioration ≥ 0.30 pp","detail":f"Current Sahm-style measure: {facts['sahm']:.2f} pp." if facts.get("sahm") is not None else "BLS data unavailable.","active":facts.get("sahm") is not None and facts["sahm"]>=.30},
      {"title":"Payroll trend below 50k/month","detail":f"Current 3-month average: {facts['payroll3']:.0f}k." if facts.get("payroll3") is not None else "BLS data unavailable.","active":facts.get("payroll3") is not None and facts["payroll3"]<50},
      {"title":"Banks tightening C&I standards > 20%","detail":f"Latest SLOOS: {facts['sloos']:.1f}%." if facts.get("sloos") is not None else "SLOOS data unavailable.","active":facts.get("sloos") is not None and facts["sloos"]>20},
      {"title":"10Y real yield ≥ 2%","detail":f"Current: {facts['real10']:.2f}%." if facts.get("real10") is not None else "Treasury data unavailable.","active":facts.get("real10") is not None and facts["real10"]>=2},
      {"title":"10Y yield up ≥ 0.40 pp in ~20 sessions","detail":f"Current move: {facts['us10move']:+.2f} pp." if facts.get("us10move") is not None else "Treasury data unavailable.","active":facts.get("us10move") is not None and facts["us10move"]>=.4},
      {"title":"Yield curve inverted / recently re-steepened","detail":"Recent inversion followed by positive slope." if facts.get("resteep") else f"Current 10Y–2Y: {facts['curve']:.2f} pp." if facts.get("curve") is not None else "Treasury data unavailable.","active":bool(facts.get("resteep")) or (facts.get("curve") is not None and facts["curve"]<0)}
    ]
    payload={"generated_at":now.isoformat(),"generated_at_display":now.strftime("%b %d, %Y %H:%M UTC"),"portfolio_value":P,
      "overall":{"regime":b["regime"],"score":round(score,1),"level":b["level"],"explanation":explanation},
      "rule_set":{"band":f'{b["cash_low"]}–{b["cash_high"]}% cash equivalents',"low_dollars":P*b["cash_low"]/100,"high_dollars":P*b["cash_high"]/100,"level":b["level"],"explanation":f"Personal monitoring band for a {CONFIG['currency']} {P:,.0f} portfolio. Use it as a prompt to review the actual fund mix, fees, and time horizon—not as an automatic sell order."},
      "metrics":metrics,"series":series,"checklist":checks,"news":news(),"source_status":status}
    OUT.write_text(json.dumps(payload,indent=2),encoding="utf-8");print("Wrote",OUT)

if __name__=="__main__":main()
