"""
Media Server  -  run with:  python server.py

Serves the folder you start it from, with:
  * a responsive Netflix-style web UI (phone / tablet / laptop)
  * HTTP Range support (video seeking works)
  * one-line colored request logs + session summary
No extra packages needed (Python 3.8+).
"""
import html
import http.server
import io
import json
import os
import re
import socket
import threading
import time
from datetime import datetime
from http import HTTPStatus
from urllib.parse import quote, unquote

# Enable ANSI colors on Windows terminals (harmless elsewhere)
os.system("")

R = "\033[0m"
B = "\033[1m"
DIM = "\033[90m"
RED = "\033[91m"
GRN = "\033[92m"
YEL = "\033[93m"
BLU = "\033[94m"
MAG = "\033[95m"
CYN = "\033[96m"

PORT = 2904
CHUNK = 64 * 1024
NAME_W = 50
HIDDEN = {"$recycle.bin", "system volume information", "thumbs.db", "desktop.ini", "found.000"}

print_lock = threading.Lock()
stats = {"requests": 0, "bytes": 0, "aborted": 0, "errors": 0}
started_at = time.time()


# --------------------------------------------------------------------------
# Web UI (single page, data is injected by list_directory)
# --------------------------------------------------------------------------
PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0b10">
<title>__TITLE__</title>
<style>
:root{--bg:#0b0b10;--panel:#15151d;--panel2:#1d1d28;--text:#f2f2f7;--mute:#8d8da0;--accent:#ff4d6d;--accent2:#7c5cff;--line:#262633;--r:14px}
@media(prefers-color-scheme:light){:root{--bg:#f4f4f8;--panel:#fff;--panel2:#e9ebf2;--text:#14141c;--mute:#6b6b80;--line:#dcdce6}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
[hidden]{display:none!important}
html,body{margin:0}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh}
body.lock{overflow:hidden}
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:10px 16px;padding-top:calc(10px + env(safe-area-inset-top));background:var(--bg);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.logo{font-size:20px;text-decoration:none;color:var(--text);white-space:nowrap}
.logo b{background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.search{flex:1;max-width:460px;margin-left:auto;display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:0 14px}
.search:focus-within{border-color:var(--accent2)}
.search input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--text);font:inherit;font-size:15px;padding:10px 0}
.wrap{max-width:1500px;margin:0 auto;padding:14px 16px 60px}
.crumbs{display:flex;gap:6px;align-items:center;overflow-x:auto;white-space:nowrap;padding:4px 0 10px;font-size:14px;scrollbar-width:none}
.crumbs::-webkit-scrollbar{display:none}
.crumbs a{color:var(--mute);text-decoration:none;padding:5px 10px;border-radius:99px;background:var(--panel);border:1px solid var(--line)}
.crumbs a:hover,.crumbs a.cur{color:var(--text);border-color:var(--accent2)}
.crumbs i{color:var(--mute);font-style:normal}
.head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin:6px 0 16px}
h1{margin:0;font-size:clamp(22px,4vw,34px);word-break:break-word}
.stats{color:var(--mute);font-size:13px;margin-top:4px}
.tools{display:flex;gap:8px;align-items:center}
select,.ibtn,.seg button{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px 11px;font:inherit;font-size:14px;cursor:pointer}
.ibtn.off{opacity:.45}
.seg{display:flex}
.seg button{border-radius:0}
.seg button:first-child{border-radius:10px 0 0 10px}
.seg button:last-child{border-radius:0 10px 10px 0;border-left:0}
.seg button.on{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
@media(min-width:700px){.grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px}}
.card{display:block;color:inherit;text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;transition:transform .18s,box-shadow .18s,border-color .18s}
.card:hover{transform:translateY(-3px);border-color:var(--accent2);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.card:active{transform:scale(.98)}
.thumb{position:relative;aspect-ratio:16/9;display:grid;place-items:center;overflow:hidden;background:var(--panel2)}
.thumb img,.thumb video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.thumb.folder{background:linear-gradient(135deg,hsl(var(--h) 70% 40%),hsl(calc(var(--h) + 50) 70% 22%))}
.thumb.audio{background:linear-gradient(135deg,#0f766e,#1e3a8a)}
.ico{position:relative;z-index:1;font-size:34px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.thumb.ready .ico{opacity:0}
.badge{position:absolute;right:8px;bottom:8px;z-index:2;background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:2px 8px;border-radius:99px}
.prog{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.25);z-index:2}
.prog i{display:block;height:100%;background:var(--accent)}
.info{padding:10px 12px 12px}
.name{font-size:14px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.sub{margin-top:4px;font-size:12px;color:var(--mute)}
.grid.list{grid-template-columns:1fr;gap:8px}
.list .card{display:flex;align-items:center}
.list .thumb{width:120px;flex:none}
.list .info{flex:1;min-width:0}
.empty{text-align:center;color:var(--mute);padding:70px 0;font-size:16px}
.ov{position:fixed;inset:0;z-index:50;background:#000;color:#fff;display:flex;flex-direction:column}
.pbar{display:flex;align-items:center;gap:8px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top))}
.pbar .t{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:10px;padding:9px 13px;font:inherit;font-size:14px;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{background:rgba(255,255,255,.26)}
.btn:disabled{opacity:.3;cursor:default}
#vid{flex:1;min-height:0;width:100%;background:#000}
.pnav{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;padding-bottom:calc(10px + env(safe-area-inset-bottom));font-size:13px;color:#bbb}
#perr{margin:0 14px 6px;padding:10px 14px;border-radius:10px;background:#5b1220;color:#ffd5dc;font-size:14px;line-height:1.4}
#viewer{align-items:center;justify-content:center}
#vimg{max-width:100%;max-height:100%;object-fit:contain;user-select:none}
.arrow{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:64px;font-size:34px;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:12px;cursor:pointer}
.arrow:hover{background:rgba(255,255,255,.28)}
#vprev{left:10px}#vnext{right:10px}
#vclose{position:absolute;top:calc(10px + env(safe-area-inset-top));right:12px;z-index:2}
#vcap{position:absolute;left:0;right:0;bottom:0;padding:12px 14px calc(12px + env(safe-area-inset-bottom));text-align:center;font-size:13px;color:#ddd;background:linear-gradient(#0000,#000b)}
#toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:99;background:#222;color:#fff;padding:10px 16px;border-radius:99px;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.5);max-width:90vw;text-align:center}
</style>
</head>
<body>
<header class="top">
  <a class="logo" href="/">&#9654; <b>Media</b></a>
  <div class="search"><span>&#128269;</span><input id="q" type="search" placeholder="Search this folder   ( / )" autocomplete="off"></div>
</header>
<main class="wrap">
  <nav id="crumbs" class="crumbs"></nav>
  <div class="head">
    <div><h1 id="title"></h1><div id="stats" class="stats"></div></div>
    <div class="tools">
      <select id="sort" title="Sort"><option value="name">Name</option><option value="date">Newest</option><option value="size">Largest</option></select>
      <button class="ibtn" id="bthumbs" title="Video previews">&#127902;</button>
      <div class="seg"><button id="bgrid" title="Grid">&#9638;</button><button id="blist" title="List">&#9776;</button></div>
    </div>
  </div>
  <div id="grid" class="grid"></div>
  <div id="empty" class="empty" hidden>Nothing here.</div>
</main>

<div id="player" class="ov" hidden>
  <div class="pbar">
    <button class="btn" id="pclose">&#10005; Close</button>
    <div class="t" id="ptitle"></div>
    <button class="btn" id="pvlc" title="Open in VLC">VLC</button>
    <a class="btn" id="pdl" download>&#11015;</a>
  </div>
  <video id="vid" controls playsinline></video>
  <div id="perr" hidden></div>
  <div class="pnav">
    <button class="btn" id="pprev">&#9198; Prev</button>
    <span id="pcount"></span>
    <button class="btn" id="pnext">Next &#9197;</button>
  </div>
</div>

<div id="viewer" class="ov" hidden>
  <button class="btn" id="vclose">&#10005;</button>
  <button class="arrow" id="vprev">&#8249;</button>
  <img id="vimg" alt="">
  <button class="arrow" id="vnext">&#8250;</button>
  <div id="vcap"></div>
</div>
<div id="toast" hidden></div>

<script id="data" type="application/json">__DATA__</script>
<script>
(()=>{
const D=JSON.parse(document.getElementById('data').textContent);
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
const nat=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
const fmtSize=n=>{const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++}return (i?n.toFixed(1):n)+' '+u[i]};
const fmtDate=t=>new Date(t*1000).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const fmtTime=s=>{s=Math.floor(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')};
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
const pretty=it=>it.dir?it.name:it.name.replace(/\.[^.]+$/,'').replace(/[._]+/g,' ');
const ext=it=>it.name.includes('.')?it.name.split('.').pop().toUpperCase().slice(0,5):'';
const posKey=it=>'pos:'+location.pathname+it.url;
const progress=it=>{const s=store.get(posKey(it),null);return s&&s.d?Math.min(100,Math.round(s.t*100/s.d)):0};
const state={q:'',sort:store.get('sort','name'),view:store.get('view','grid'),thumbs:store.get('thumbs',true)};

let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3200)}

/* ---------- header / breadcrumbs ---------- */
const parts=D.path.split('/').filter(Boolean);
const title=parts.length?parts[parts.length-1]:'Media Library';
$('#title').textContent=title;
document.title=title;
(()=>{
  let acc='/';const c=[{n:'Home',u:'/'}];
  parts.forEach(p=>{acc+=encodeURIComponent(p)+'/';c.push({n:p,u:acc})});
  $('#crumbs').innerHTML=c.map((x,i)=>(i?'<i>&#8250;</i>':'')+`<a href="${x.u}"${i==c.length-1?' class="cur"':''}>${esc(x.n)}</a>`).join('');
})();
(()=>{
  const n={dir:0,video:0,image:0,audio:0,file:0};let sz=0;
  D.items.forEach(i=>{n[i.dir?'dir':i.kind]++;sz+=i.size});
  const out=[];
  if(n.dir)out.push(n.dir+(n.dir>1?' folders':' folder'));
  if(n.video)out.push(n.video+(n.video>1?' videos':' video'));
  if(n.image)out.push(n.image+(n.image>1?' images':' image'));
  if(n.audio)out.push(n.audio+' audio');
  if(n.file)out.push(n.file+(n.file>1?' files':' file'));
  if(sz)out.push(fmtSize(sz));
  $('#stats').textContent=out.join('  \u00b7  ')||'Empty folder';
})();

/* ---------- video thumbnail loader (max 3 at once) ---------- */
const tq=[];let active=0;
function pump(){
  while(active<3&&tq.length){
    const v=tq.shift();active++;let fin=false;
    const done=()=>{if(fin)return;fin=true;active--;pump()};
    v.addEventListener('loadeddata',done,{once:true});
    v.addEventListener('error',done,{once:true});
    setTimeout(done,8000);
    v.preload='metadata';v.src=v.dataset.src+'#t=1';
  }
}
const io=new IntersectionObserver(es=>{
  for(const e of es){if(!e.isIntersecting)continue;io.unobserve(e.target);tq.push(e.target)}
  pump();
},{rootMargin:'200px'});

/* ---------- list + render ---------- */
function list(){
  const q=state.q.trim().toLowerCase();
  const a=D.items.filter(i=>!q||i.name.toLowerCase().includes(q));
  const s=state.sort;
  a.sort((x,y)=>{
    if(x.dir!==y.dir)return x.dir?-1:1;
    if(s==='size')return y.size-x.size||nat.compare(x.name,y.name);
    if(s==='date')return y.mtime-x.mtime;
    return nat.compare(x.name,y.name);
  });
  return a;
}
function card(it){
  const a=document.createElement('a');
  a.className='card';a.href=it.url;a.title=it.name;
  let th;
  if(it.dir){
    th=`<div class="thumb folder" style="--h:${hue(it.name)}"><span class="ico">&#128193;</span><span class="badge">${it.count} item${it.count==1?'':'s'}</span></div>`;
  }else if(it.kind==='image'){
    th=`<div class="thumb"><img loading="lazy" decoding="async" src="${it.url}" alt=""><span class="badge">${esc(ext(it))}</span></div>`;
  }else if(it.kind==='video'){
    const p=progress(it);
    th=`<div class="thumb"><span class="ico">&#9654;</span>${state.thumbs?`<video muted playsinline preload="none" data-src="${it.url}"></video>`:''}<span class="badge">${esc(ext(it))}</span>${p?`<div class="prog"><i style="width:${p}%"></i></div>`:''}</div>`;
  }else if(it.kind==='audio'){
    th=`<div class="thumb audio"><span class="ico">&#127925;</span><span class="badge">${esc(ext(it))}</span></div>`;
  }else{
    th=`<div class="thumb"><span class="ico">&#128196;</span><span class="badge">${esc(ext(it))||'FILE'}</span></div>`;
  }
  const sub=it.dir?'Folder':`${fmtSize(it.size)} \u00b7 ${fmtDate(it.mtime)}`;
  a.innerHTML=th+`<div class="info"><div class="name">${esc(pretty(it))}</div><div class="sub">${sub}</div></div>`;
  a.addEventListener('click',e=>{
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;
    if(!it.dir&&(it.kind==='video'||it.kind==='audio'||it.kind==='image')){e.preventDefault();openMedia(it)}
  });
  const v=a.querySelector('video');
  if(v){
    v.addEventListener('loadeddata',()=>v.parentElement.classList.add('ready'));
    v.addEventListener('error',()=>v.remove());
    io.observe(v);
  }
  return a;
}
function render(){
  io.disconnect();tq.length=0;
  const g=$('#grid');g.innerHTML='';
  g.className='grid'+(state.view==='list'?' list':'');
  const a=list();
  const frag=document.createDocumentFragment();
  a.forEach(it=>frag.appendChild(card(it)));
  g.appendChild(frag);
  $('#empty').hidden=a.length>0;
  $('#empty').textContent=state.q?'No matches for "'+state.q+'"':'Nothing here.';
  $('#bgrid').classList.toggle('on',state.view!=='list');
  $('#blist').classList.toggle('on',state.view==='list');
  $('#bthumbs').classList.toggle('off',!state.thumbs);
  $('#sort').value=state.sort;
}
$('#q').addEventListener('input',e=>{state.q=e.target.value;render()});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;store.set('sort',state.sort);render()});
$('#bgrid').onclick=()=>{state.view='grid';store.set('view','grid');render()};
$('#blist').onclick=()=>{state.view='list';store.set('view','list');render()};
$('#bthumbs').onclick=()=>{state.thumbs=!state.thumbs;store.set('thumbs',state.thumbs);toast('Video previews '+(state.thumbs?'on':'off'));render()};

/* ---------- overlays (player + image viewer) ---------- */
const vid=$('#vid');
let pl={list:[],i:0};
let overlayOpen=false;
function pushOv(){if(!overlayOpen){history.pushState({ov:1},'');overlayOpen=true}}
function hideAll(){
  const wasOpen=!$('#player').hidden||!$('#viewer').hidden;
  $('#player').hidden=true;$('#viewer').hidden=true;
  document.body.classList.remove('lock');
  vid.pause();vid.removeAttribute('src');vid.load();
  $('#vimg').removeAttribute('src');
  if(wasOpen)render();
}
function closeOv(){if(overlayOpen)history.back();else hideAll()}
addEventListener('popstate',()=>{overlayOpen=false;hideAll()});

function openMedia(it){
  pl.list=D.items.filter(x=>!x.dir&&x.kind===it.kind).sort((a,b)=>nat.compare(a.name,b.name));
  pl.i=pl.list.findIndex(x=>x.url===it.url);
  pushOv();
  document.body.classList.add('lock');
  it.kind==='image'?showImg():showVid();
}

/* video / audio */
function showVid(){
  const it=pl.list[pl.i];
  $('#viewer').hidden=true;$('#player').hidden=false;
  $('#ptitle').textContent=pretty(it);
  $('#pcount').textContent=(pl.i+1)+' / '+pl.list.length;
  $('#pprev').disabled=pl.i<=0;
  $('#pnext').disabled=pl.i>=pl.list.length-1;
  $('#pdl').href=it.url;
  $('#perr').hidden=true;
  const saved=store.get(posKey(it),null);
  vid.src=it.url;
  vid.onloadedmetadata=()=>{
    if(saved&&saved.t>5&&vid.duration&&saved.t<vid.duration-10){
      vid.currentTime=saved.t;toast('Resumed from '+fmtTime(saved.t));
    }
  };
  vid.play().catch(()=>{});
}
let lastSave=0;
vid.addEventListener('timeupdate',()=>{
  const now=Date.now();
  if(now-lastSave<4000||!vid.duration||$('#player').hidden)return;
  lastSave=now;
  const it=pl.list[pl.i];
  if(it)store.set(posKey(it),{t:vid.currentTime,d:vid.duration});
});
vid.addEventListener('ended',()=>{
  const it=pl.list[pl.i];
  if(it)store.set(posKey(it),{t:0,d:vid.duration});
  if(pl.i<pl.list.length-1){pl.i++;showVid()}
});
vid.addEventListener('error',()=>{
  if($('#player').hidden)return;
  const e=$('#perr');
  e.hidden=false;
  e.textContent="This browser can't play this file (usually HEVC video or AC3/DTS audio inside the MKV). Try the VLC button or download it.";
});
function stepVid(d){const n=pl.i+d;if(n>=0&&n<pl.list.length){pl.i=n;showVid()}}
$('#pprev').onclick=()=>stepVid(-1);
$('#pnext').onclick=()=>stepVid(1);
$('#pclose').onclick=closeOv;

function copyText(t){
  try{
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t);return true}
    const a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';
    document.body.appendChild(a);a.select();const ok=document.execCommand('copy');a.remove();return ok;
  }catch(e){return false}
}
$('#pvlc').onclick=()=>{
  const it=pl.list[pl.i];
  const u=new URL(it.url,location.href);
  const ua=navigator.userAgent;
  if(/Android/i.test(ua)){
    location.href='intent://'+u.host+u.pathname+'#Intent;scheme=http;package=org.videolan.vlc;type=video/*;end';
  }else if(/iPhone|iPad/i.test(ua)){
    location.href='vlc-x-callback://x-callback-url/stream?url='+encodeURIComponent(u.href);
  }else{
    toast(copyText(u.href)?'Link copied - in VLC: Media > Open Network Stream':u.href);
  }
};

/* images */
function showImg(){
  const it=pl.list[pl.i];
  $('#player').hidden=true;$('#viewer').hidden=false;
  vid.pause();
  $('#vimg').src=it.url;
  $('#vcap').textContent=it.name+'   ('+(pl.i+1)+' / '+pl.list.length+')';
  $('#vprev').hidden=pl.i<=0;
  $('#vnext').hidden=pl.i>=pl.list.length-1;
  [pl.i-1,pl.i+1].forEach(k=>{if(pl.list[k]){const p=new Image();p.src=pl.list[k].url}});
}
function stepImg(d){const n=pl.i+d;if(n>=0&&n<pl.list.length){pl.i=n;showImg()}}
$('#vprev').onclick=()=>stepImg(-1);
$('#vnext').onclick=()=>stepImg(1);
$('#vclose').onclick=closeOv;
let sx=0,sy=0;
$('#viewer').addEventListener('touchstart',e=>{sx=e.changedTouches[0].clientX;sy=e.changedTouches[0].clientY},{passive:true});
$('#viewer').addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)stepImg(dx<0?1:-1);
},{passive:true});

/* keyboard */
addEventListener('keydown',e=>{
  if(!$('#player').hidden){
    const k=e.key;let h=true;
    if(k==='Escape')closeOv();
    else if(k==='ArrowRight')vid.currentTime+=10;
    else if(k==='ArrowLeft')vid.currentTime-=10;
    else if(k==='n'||k==='N')stepVid(1);
    else if(k==='p'||k==='P')stepVid(-1);
    else if(k===' ')vid.paused?vid.play():vid.pause();
    else h=false;
    if(h)e.preventDefault();
  }else if(!$('#viewer').hidden){
    if(e.key==='Escape')closeOv();
    else if(e.key==='ArrowRight')stepImg(1);
    else if(e.key==='ArrowLeft')stepImg(-1);
  }else if(e.key==='/'&&document.activeElement!==$('#q')){
    e.preventDefault();$('#q').focus();
  }
});

render();
})();
</script>
</body>
</html>
"""


# --------------------------------------------------------------------------
# Console helpers
# --------------------------------------------------------------------------
def ts():
    return datetime.now().strftime("%H:%M:%S")


def human(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{int(n)} B" if u == "B" else f"{n:.1f} {u}"
        n /= 1024


def device(ua):
    ua = ua or ""
    for key, name in (("iPhone", "iOS"), ("iPad", "iOS"), ("Android", "Android"),
                      ("Windows", "Windows"), ("Macintosh", "Mac"), ("Linux", "Linux")):
        if key in ua:
            return name
    return "Other"


def badge(code):
    if not code:
        return f"{DIM} --- {R}"
    bg = "42" if code < 300 else "43" if code < 400 else "41"
    fg = "30" if code < 400 else "97"
    return f"\033[{fg};{bg}m {code} {R}"


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def banner(ip):
    w = 60
    rows = [("Folder", os.getcwd()),
            ("Phone", f"http://{ip}:{PORT}"),
            ("Local", f"http://localhost:{PORT}")]
    print(f"{CYN}╭{'─' * w}╮{R}")
    print(f"{CYN}│{R}{B}{'  MEDIA SERVER'.ljust(w)}{R}{CYN}│{R}")
    print(f"{CYN}├{'─' * w}┤{R}")
    for k, v in rows:
        label = f"  {k:<8}"
        v = v[: w - len(label)]
        pad = " " * (w - len(label) - len(v))
        print(f"{CYN}│{R}{DIM}{label}{R}{GRN}{v}{R}{pad}{CYN}│{R}")
    print(f"{CYN}╰{'─' * w}╯{R}")
    print(f"  {GRN}✔ sent{R}   {YEL}↪ seek{R}   {RED}✖ stopped{R} "
          f"{DIM}(normal when you skip or close a video){R}\n")
    head = ("TIME".ljust(10) + "DEVICE".ljust(9) + "CODE".ljust(7) +
            "TYPE".ljust(8) + "PATH".ljust(NAME_W + 2) + "RESULT")
    print(f"{DIM}{head}{R}")
    print(f"{DIM}{'─' * 105}{R}")


# --------------------------------------------------------------------------
# Request handler
# --------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".mkv": "video/webm",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/mp4",
        ".m4v": "video/mp4",
        ".avi": "video/x-msvideo",
        ".wmv": "video/x-ms-wmv",
        ".flv": "video/x-flv",
        ".3gp": "video/3gpp",
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".png": "image/png",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        ".opus": "audio/ogg",
    }

    # ---------- quiet the defaults ----------
    def log_message(self, format, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except OSError:
            pass

    def finish(self):
        try:
            super().finish()
        except OSError:
            pass

    def send_response(self, code, message=None):
        self.status = int(code)
        super().send_response(code, message)

    # ---------- one-line log ----------
    def kind_of(self):
        if os.path.isdir(self.fs_path):
            return "FOLDER", YEL
        ct = self.guess_type(self.fs_path)
        if ct.startswith("video/"):
            return "VIDEO", MAG
        if ct.startswith("image/"):
            return "IMAGE", BLU
        if ct.startswith("audio/"):
            return "AUDIO", CYN
        return "FILE", DIM

    def emit(self, aborted=False):
        if self.logged:
            return
        self.logged = True

        code = self.status or 0
        if code == 404 and self.req_path.endswith("favicon.ico"):
            return  # browsers always ask for this, ignore the noise

        dur = max(time.time() - self.t0, 0.001)
        kind, kcol = self.kind_of()

        name = self.req_path
        if len(name) > NAME_W:
            name = "…" + name[-(NAME_W - 1):]
        name = name.ljust(NAME_W)

        is_dir = kind == "FOLDER"
        if code >= 400:
            detail = f"{RED}{HTTPStatus(code).phrase}{R}"
        elif 300 <= code < 400:
            detail = f"{YEL}redirect{R}"
        elif is_dir:
            detail = f"{DIM}listing{R}"
        else:
            start = self.range_[0] if self.range_ else 0
            fsize = self.file_size or 1
            pos = start + self.sent
            parts = []
            if start > 0:
                parts.append(f"{YEL}↪ seek to {int(start * 100 / fsize)}%{R}")
            if aborted:
                parts.append(f"{RED}✖ stopped at {int(pos * 100 / fsize)}%{R} "
                             f"{DIM}({human(self.sent)} sent){R}")
            else:
                parts.append(f"{GRN}✔ {human(self.sent)}{R}")
            parts.append(f"{DIM}{human(self.sent / dur)}/s · {dur:.1f}s{R}")
            detail = "  ".join(parts)

        line = (f"{DIM}{ts()}{R}  {device(self.headers.get('User-Agent')):<7}  "
                f"{badge(code)}  {kcol}{kind:<6}{R}  {name}  {detail}")

        with print_lock:
            print(line, flush=True)
            stats["requests"] += 1
            stats["bytes"] += self.sent
            if aborted:
                stats["aborted"] += 1
            if code >= 400:
                stats["errors"] += 1

    # ---------- custom folder page ----------
    def list_directory(self, path):
        try:
            names = os.listdir(path)
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "No permission to list directory")
            return None

        items = []
        for n in names:
            if n.startswith(".") or n.lower() in HIDDEN:
                continue
            full = os.path.join(path, n)
            try:
                st = os.stat(full)
            except OSError:
                continue
            isdir = os.path.isdir(full)
            if isdir:
                kind, count = "folder", 0
                try:
                    count = sum(1 for x in os.listdir(full) if not x.startswith("."))
                except OSError:
                    pass
            else:
                count = 0
                ct = self.guess_type(full)
                kind = ("video" if ct.startswith("video/") else
                        "image" if ct.startswith("image/") else
                        "audio" if ct.startswith("audio/") else "file")
            items.append({
                "name": n,
                "dir": isdir,
                "kind": kind,
                "size": 0 if isdir else st.st_size,
                "mtime": int(st.st_mtime),
                "count": count,
                "url": quote(n) + ("/" if isdir else ""),
            })

        data = json.dumps({"path": self.req_path, "items": items}, ensure_ascii=False)
        data = data.replace("<", "\\u003c")
        title = self.req_path.strip("/").split("/")[-1] or "Media Library"
        payload = (PAGE.replace("__TITLE__", html.escape(title))
                       .replace("__DATA__", data)).encode("utf-8", "replace")

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(payload)

    # ---------- request handling ----------
    def do_HEAD(self):
        super().do_HEAD()
        self.emit()

    def send_head(self):
        self.t0 = time.time()
        self.sent = 0
        self.range_ = None
        self.status = None
        self.logged = False
        self.file_size = 0
        self.req_path = unquote(self.path.split("?")[0])
        self.fs_path = self.translate_path(self.path)
        rng = self.headers.get("Range")

        # No Range header, or not a file -> default behaviour
        if not rng or not os.path.isfile(self.fs_path):
            f = super().send_head()
            if f is None:
                self.emit()
            else:
                f.seek(0, io.SEEK_END)
                self.file_size = f.tell()
                f.seek(0)
            return f

        # ---- Range request (video seeking / resuming) ----
        ctype = self.guess_type(self.fs_path)
        size = os.path.getsize(self.fs_path)
        self.file_size = size
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        if not m or (m.group(1) == "" and m.group(2) == ""):
            self.send_error(416, "Bad Range")
            self.emit()
            return None

        if m.group(1) == "":  # suffix range: last N bytes
            start = max(size - int(m.group(2)), 0)
            end = size - 1
        else:
            start = int(m.group(1))
            end = min(int(m.group(2)) if m.group(2) else size - 1, size - 1)

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.emit()
            return None

        try:
            f = open(self.fs_path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            self.emit()
            return None

        self.range_ = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        try:
            remaining = None
            if self.range_:
                start, end = self.range_
                source.seek(start)
                remaining = end - start + 1
            while remaining is None or remaining > 0:
                n = CHUNK if remaining is None else min(CHUNK, remaining)
                chunk = source.read(n)
                if not chunk:
                    break
                outputfile.write(chunk)
                self.sent += len(chunk)
                if remaining is not None:
                    remaining -= len(chunk)
            self.emit()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.emit(aborted=True)


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    banner(local_ip())
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            mins = (time.time() - started_at) / 60
            print(f"\n{DIM}{'─' * 105}{R}")
            print(f"{B}Session summary{R}  "
                  f"{stats['requests']} requests · {human(stats['bytes'])} sent · "
                  f"{YEL}{stats['aborted']} stopped{R} · "
                  f"{RED}{stats['errors']} errors{R} · {mins:.1f} min")