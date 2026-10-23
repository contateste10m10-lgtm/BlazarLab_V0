(() => {
  'use strict';
  const section = document.getElementById('laboratorio');
  const navLink = document.querySelector('#siteNav a[href="#laboratorio"]');
  if (!section || !navLink) return;
  const rootBase = new URL('.', document.baseURI);
  const asset = path => new URL(path, rootBase).href;
  let promise = null;
  const status = (message, failed=false) => {
    const box = section.querySelector('.lab-loading-panel');
    if (box) {
      box.classList.toggle('is-error', failed);
      box.innerHTML = failed
        ? `<strong>Não foi possível abrir o Laboratório.</strong><p>${message}</p><button type="button" class="button button-primary" data-lab-retry>Tentar novamente</button>`
        : `<span class="lab-load-mark" aria-hidden="true"></span><strong>Preparando o Laboratório</strong><p>${message}</p>`;
      box.querySelector('[data-lab-retry]')?.addEventListener('click', () => { promise=null; loadLab(); });
    }
  };
  function loadCss(){
    if (document.querySelector('link[data-laboratory-css]')) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const link=document.createElement('link');link.rel='stylesheet';link.href=asset('assets/laboratory/laboratory.css');link.dataset.laboratoryCss='true';
      link.onload=resolve;link.onerror=()=>reject(new Error('O CSS local do Laboratório não foi encontrado.'));document.head.appendChild(link);
    });
  }
  function loadScript(path){
    const key=`data-lab-script="${path}"`;
    if (document.querySelector(`script[${key}]`)) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=asset(path);script.async=false;script.dataset.labScript=path;
      script.onload=resolve;script.onerror=()=>reject(new Error(`Não foi possível carregar a dependência local: ${path}`));document.head.appendChild(script);
    });
  }
  async function loadLab(){
    if (promise) return promise;
    status('Carregando a interface e preparando os recursos locais.');
    promise=(async()=>{
      try {
        await loadCss();
        const response=await fetch(asset('assets/laboratory/fragment.html'),{cache:'no-cache'});
        if(!response.ok) throw new Error(`Falha ao carregar a interface (${response.status}).`);
        const markup=await response.text();
        section.innerHTML=markup;
        const scripts=['assets/laboratory/vendor/chart.umd.min.js','assets/laboratory/vendor/hammer.min.js','assets/laboratory/vendor/chartjs-plugin-zoom.min.js','assets/laboratory/vendor/pako.min.js','assets/laboratory/data-library.js','assets/laboratory/analysis-core.js','assets/laboratory/app.js'];
        for(const src of scripts) await loadScript(src);
        const root=section.querySelector('#labRuntimeRoot');
        if(!root || !document.getElementById('analyzeBtn')) throw new Error('A interface carregou, mas os controles principais não foram encontrados.');
        section.dataset.loaded='true';
        section.classList.add('lab-is-loaded');
        requestAnimationFrame(()=>requestAnimationFrame(()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})));
      } catch(error){
        section.dataset.loaded='false';
        section.innerHTML=`<div class="section-wrap lab-loading-wrap"><div class="lab-loading-panel is-error" role="alert"><strong>Não foi possível abrir o Laboratório.</strong><p>${String(error?.message||error).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</p><button type="button" class="button button-primary" data-lab-retry>Tentar novamente</button></div></div>`;
        section.querySelector('[data-lab-retry]')?.addEventListener('click',()=>{section.innerHTML='<div class="section-wrap lab-loading-wrap"><div class="lab-loading-panel" role="status"><span class="lab-load-mark" aria-hidden="true"></span><strong>Preparando o Laboratório</strong><p>Recarregando os recursos locais.</p></div></div>';promise=null;loadLab();});
        throw error;
      }
    })().catch(err=>{promise=null;console.error('BlazarLab Laboratório não carregou:',err);});
    return promise;
  }
  navLink.addEventListener('click',()=>{if(section.dataset.loaded!=='true')loadLab();});
  if (location.hash === '#laboratorio') loadLab();
})();