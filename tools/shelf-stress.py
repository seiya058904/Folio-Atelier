"""Run the large-shelf and pagination benchmark in an isolated Chrome context."""

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("tag")
parser.add_argument("url", help="Site base URL, without a query string")
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--ignore-certificate-errors", action="store_true")
parser.add_argument("--verify", action="store_true", help="Assert optimized shelf, contents and mobile behavior")
args = parser.parse_args()
out = args.out
out.mkdir(parents=True, exist_ok=True)
tag, base = args.tag, args.url.rstrip("/") + "/"
chrome_args = ["--ignore-certificate-errors"] if args.ignore_certificate_errors else []

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,args=chrome_args)
    c=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
    page=c.new_page()
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.goto(base+'?perf&quality=high&lang=en',wait_until='domcontentloaded',timeout=90000)
    page.bring_to_front()
    page.wait_for_function('window.__folio && document.querySelector("#loading").hidden',timeout=90000)
    page.evaluate('''async () => {
      const {createBook}=await import('./src/state/schema.js');
      const {saveBook}=await import('./src/state/storage.js');
      const {PRESETS}=await import('./src/data/presets.js');
      await Promise.all(Array.from({length:96},(_,i)=>{
        const book=createBook({title:'Archive volume '+String(i+1).padStart(3,'0'),author:'Folio Archive',presetId:PRESETS[i%PRESETS.length].id});
        book.createdAt=i+1;
        if(i===95) book.pages=[{id:'toc',type:'contents'},...Array.from({length:32},(_,n)=>({
          id:'chapter-'+n,type:'chapter',title:'Letter '+(n+1),
          text: n===0 ? ('In the atelier the press leaves a deep impression upon the cloth. 纸张承载文字与记忆。\\n\\n').repeat(1300) : 'Bookbinding notes and details.'
        }))];
        return saveBook(book);
      }));
    }''')
    page.add_init_script('''window.tasks=[]; new PerformanceObserver(l=>tasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true})''')
    page.reload(wait_until='domcontentloaded',timeout=90000)
    page.bring_to_front()
    page.wait_for_function('window.__folio && document.querySelector("#loading").hidden',timeout=90000)
    ready = round(page.evaluate('performance.now()'))
    page.wait_for_timeout(2000)
    page.evaluate('document.querySelector("#perf-overlay").hidden=true')
    page.screenshot(path=str(out/(tag+'-shelf.png')),animations='disabled')
    result=page.evaluate('''() => {
      const e=__folio.engine; const r=e.debug.rigs;
      return {bookCount:__folio.store.books.length,resident:r.filter(Boolean).length,scene:e.debug.scene.getObjectByName('continuous-shelf-stage').children.length,longTasks:tasks.map(Math.round)}
    }''')
    result['bootReady'] = ready
    page.evaluate('''() => {
      __folioPerf.reset();
      window.sweepTimes = [];
      window.sweeping = true;
      function sample(now) {
        if (!window.sweeping) return;
        sweepTimes.push(now);
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }''')
    for index in [12,24,36,48,60,72,84,95,0,95]:
        page.evaluate('(i)=>__folio.engine.select(i)',index)
        page.wait_for_timeout(370)
    page.wait_for_timeout(1700)
    result['sweep']=page.evaluate('''() => {
      window.sweeping = false;
      const gaps = sweepTimes.slice(1).map((time, index) => time - sweepTimes[index]).sort((a, b) => a - b);
      return {
        perf: __folioPerf.snapshot(),
        raf: {count: gaps.length, p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1), over50: gaps.filter(ms => ms > 50).length},
        long: tasks.slice(),
        resident: __folio.engine.debug.rigs.filter(Boolean).length,
        title: document.querySelector('#selection-title').textContent
      };
    }''')
    page.locator('#inspect').click()
    page.wait_for_function('__folio.engine.mode==="detail"')
    page.wait_for_timeout(1100)
    page.screenshot(path=str(out/(tag+'-studio.png')),animations='disabled')
    result['pages']=page.evaluate('''async()=>{
      const {paginate,forgetMeasurements}=await import('./src/textures/pages.js');
      const book=structuredClone(__folio.engine.debug.activeRig.data);
      forgetMeasurements();
      const now=performance.now();
      const flat=paginate(book);
      const cold=performance.now()-now;
      const warm=performance.now();paginate(book);
      const warmMs=performance.now()-warm;
      const samples=[];
      for(let i=0;i<8;i++){
        book.pages[1].text+=' revision '+i;
        const tick=performance.now();paginate(book);samples.push(performance.now()-tick);
      }
      const contents=flat.filter(x=>x.type==='contents');
      const rows=contents.flatMap(x=>x.chapters.slice(0,15));
      const incremental=JSON.stringify(paginate(book));
      forgetMeasurements();
      return {cold,warmMs,samples,count:flat.length,contents:contents.length,contentsRows:rows.length,
        linksAgree:rows.every(row=>flat[row.page-1]?.title===row.title),
        reflowMatchesCold:incremental===JSON.stringify(paginate(book))};
    }''')
    page.locator('#tab-pages').click()
    page.wait_for_timeout(800)
    if page.locator('#toggle-book').get_attribute('aria-pressed') != 'true':
        page.locator('#toggle-book').click()
    page.wait_for_timeout(900)
    for _ in range(6):
        if page.locator('#next-page').is_enabled():
            page.locator('#next-page').click()
        page.wait_for_timeout(45)
    page.wait_for_timeout(800)
    page.screenshot(path=str(out/(tag+'-spread.png')),animations='disabled')
    result['spread']=page.locator('#page-counter').inner_text()
    page.locator('#close-detail').click()
    page.wait_for_function('__folio.engine.mode==="hero"')
    result['afterClose']=page.evaluate('''()=>({textures:__folioPerf.snapshot().textures,active:!!__folio.engine.debug.activeRig,mode:__folio.engine.mode})''')
    c.close()
    mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1.5,has_touch=True,is_mobile=True)
    m=mobile.new_page()
    m.on('pageerror',lambda err: errors.append(str(err)))
    m.goto(base+'?perf&quality=balanced&lang=zh',wait_until='domcontentloaded',timeout=90000)
    m.bring_to_front()
    m.wait_for_function('window.__folio && document.querySelector("#loading").hidden',timeout=90000)
    m.evaluate('document.querySelector("#perf-overlay").hidden=true')
    m.locator('#create-first').tap()
    m.locator('#new-book-name').fill('纸间手记 · Atelier')
    m.locator('#new-book-form button[type=submit]').tap()
    m.wait_for_function('__folio.engine.mode==="detail"',timeout=30000)
    m.wait_for_timeout(1500)
    m.screenshot(path=str(out/(tag+'-mobile.png')),animations='disabled')
    result['mobile']=m.evaluate('''()=>({language:document.documentElement.lang,body:document.documentElement.scrollWidth,window:innerWidth,tab:document.querySelector('#studio-tabs').getBoundingClientRect().toJSON(),sheet:document.querySelector('#studio').getBoundingClientRect().toJSON()})''')
    m.locator('#close-detail').tap()
    m.wait_for_function('__folio.engine.mode==="hero"')
    result['mobile']['importVisible'] = m.locator('#import-book').is_visible()
    result['errors']=errors
    (out/(tag+'-stress.json')).write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('sweep','longTasks')},ensure_ascii=True),flush=True)
    if args.verify:
        assert not errors, errors
        assert result['bookCount'] == 96 and result['resident'] <= 9
        assert result['sweep']['resident'] <= 16 and result['sweep']['title'] == "Archive volume 096"
        assert result['pages']['contentsRows'] == 32 and result['pages']['linksAgree']
        assert result['pages']['reflowMatchesCold']
        assert result['spread'].startswith("PAGES ") and not result['afterClose']['active']
        assert result['mobile']['body'] == result['mobile']['window'] and result['mobile']['importVisible']
