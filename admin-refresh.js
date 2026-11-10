/** MY EXPO BAG 管理アプリ更新監視。UIバージョンは1.0.1に固定。 */
(()=>{
  'use strict';
  const page=location.pathname.split('/').pop()||'admin.html';
  const sources={
    'admin.html':['admin.html','admin-auth.js'],
    'login.html':['login.html','login-auth.js'],
    'products.html':['products.html','products.js'],
    'scan.html':['scan.html','scan.js'],
    'account.html':['account.html','account.js'],
    'event-settings.html':['event-settings.html','event-settings.js'],
    'signup.html':['signup.html','signup-auth.js'],
    'brand-setup.html':['brand-setup.html','brand-setup.js']
  }[page];
  if(!sources)return;
  const INTERVAL=75_000;
  const key='meb_fresh';
  const now=()=>Date.now();
  let baseline=null,checking=false,updateAvailable=false,navigating=false,lastCheck=0,dirty=false;
  // Entering an input, starting a scanner or editing a form must NOT be interrupted.
  document.addEventListener('input',e=>{if(e.target.closest('form'))dirty=true;},true);
  document.addEventListener('change',e=>{if(e.target.closest('form'))dirty=true;},true);
  const scanBusy=()=>page==='scan.html' && (
    !!document.querySelector('#reader video') ||
    ['review','prepared'].some(stage=>{const e=document.getElementById(stage+'-panel');return e&&!e.hidden;})
  );
  const unsafe=()=>scanBusy()||dirty||(['account.html','event-settings.html'].includes(page) && !!document.querySelector('input:focus,textarea:focus'));
  function updateURL(){const url=new URL(location.href);url.searchParams.set(key,String(now()));return url.href;}
  function apply(){if(navigating)return;navigating=true;location.replace(updateURL());}
  function prompt(){
    if(document.getElementById('meb-admin-fresh-notice'))return;
    const node=document.createElement('div');node.id='meb-admin-fresh-notice';node.setAttribute('role','status');
    Object.assign(node.style,{position:'fixed',zIndex:'100000',bottom:'max(14px,env(safe-area-inset-bottom,0px))',left:'12px',right:'12px',padding:'12px',borderRadius:'12px',background:'#132e3c',boxShadow:'0 6px 24px #0006',color:'#fff',display:'flex',gap:'10px',alignItems:'center',justifyContent:'space-between',fontSize:'13px'});
    const msg=document.createElement('span');msg.textContent='更新版が公開されました。現在の操作を終えたら更新してください。';
    const b=document.createElement('button');b.type='button';b.textContent='更新';
    Object.assign(b.style,{padding:'9px 14px',borderRadius:'8px',border:'1px solid #8acedc',background:'#21627a',color:'#fff',whiteSpace:'nowrap'});
    b.addEventListener('click',()=>{if(scanBusy() && !window.confirm('QR読み取り・商品確認の途中です。中断して更新しますか？'))return;apply();});
    node.append(msg,b);document.body.append(node);
  }
  const hashString=s=>{let n=2166136261;for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619);}return (n>>>0).toString(16)+':'+s.length;};
  async function currentSignature(){
    // Detect actual published content, rather than a release.json revision that might not be bumped.
    const contents=await Promise.all(sources.map(async name=>{
      const url=new URL('./'+name,location.href);url.searchParams.set('_meb_check',String(now()));
      const r=await fetch(url.href,{cache:'no-store'});
      if(!r.ok)throw Error(name+' '+r.status);
      return name+':'+hashString(await r.text());
    }));return contents.join('|');
  }
  async function check(force=false){
    if(checking||navigating||document.visibilityState==='hidden')return;
    if(!force&&now()-lastCheck<INTERVAL)return;
    checking=true;lastCheck=now();
    try{
      const fresh=await currentSignature();
      if(baseline===null){baseline=fresh;return;}
      if(fresh!==baseline){updateAvailable=true;baseline=fresh;}
      if(updateAvailable){if(unsafe())prompt();else apply();}
    }catch(e){console.warn('管理画面の更新確認を保留',e);}
    finally{checking=false;}
  }
  if('serviceWorker' in navigator && location.protocol==='https:'){
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'})
      .then(reg=>reg.update().catch(()=>{})).catch(e=>console.warn('SW更新不可',e));
  }
  function begin(){
    // iPhone PWA may resurrect a previously cached document. Refresh ONCE per
    // new standalone launch to anchor the document and module URLs to the network.
    // Never refresh while a scanner is active or the user is editing a form.
    const standalone=window.navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
    const anchorKey='meb_admin_anchored_'+page;
    const isFirstLaunch=standalone&&!new URL(location.href).searchParams.has(key)&&sessionStorage.getItem(anchorKey)!=='1';
    if(isFirstLaunch && ['login.html','admin.html','products.html','scan.html'].includes(page) && !unsafe()){
      sessionStorage.setItem(anchorKey,'1');apply();return;
    }
    sessionStorage.setItem(anchorKey,'1');
    check(true);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check(true);});
    window.addEventListener('pageshow',()=>check(true));
    window.addEventListener('focus',()=>check(true));
    window.addEventListener('online',()=>check(true));
    setInterval(()=>check(),INTERVAL);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});else begin();
})();
