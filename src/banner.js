// The First Draft band that goes on every demo and every social kit page.
//
// Injected by the Worker at serve time, never baked into the demo file, so
// the HTML we hand a paying client is clean and so we can change the pitch
// once and have every live draft update.
//
// Two parts: a slim bar pinned to the top that says whose draft this is and
// who made it, and a closing card at the end of the page with contact details
// spelled out for someone who does not live on a computer.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function injectBanner(html, { name, slug, email, site, phone, kit }) {
  const who = name ? `for ${esc(name)}` : 'for your business';
  const tel = phone ? phone.replace(/[^\d+]/g, '') : '';

  const css = `
#fd-bar,#fd-bar *,#fd-end,#fd-end *{box-sizing:border-box}
#fd-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#15173A;color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.35;
  display:flex;align-items:center;gap:10px;padding:9px 12px;box-shadow:0 1px 0 rgba(0,0,0,.22)}
#fd-bar .fd-dot{flex:none;width:9px;height:9px;background:#5E63E0;border-radius:2px;transform:rotate(45deg)}
#fd-bar .fd-txt{flex:1 1 auto;min-width:0;color:#fff;font-weight:500}
#fd-bar .fd-txt b{color:#fff;font-weight:700}
#fd-bar .fd-txt .fd-long{color:rgba(255,255,255,.72)}
#fd-bar a.fd-cta{flex:none;background:#5E63E0;color:#fff;text-decoration:none;font-weight:700;font-size:13px;
  padding:9px 14px;border-radius:9px;white-space:nowrap;min-height:40px;display:inline-flex;align-items:center}
#fd-bar a.fd-cta:hover{background:#4348C7}
#fd-bar button.fd-x{flex:none;background:transparent;border:0;color:rgba(255,255,255,.65);font-size:20px;line-height:1;
  cursor:pointer;padding:8px 6px;min-width:40px;min-height:40px}
#fd-bar button.fd-x:hover{color:#fff}
@media(max-width:640px){
  #fd-bar{font-size:13px;padding:8px 8px 8px 12px;gap:8px}
  #fd-bar .fd-long{display:none}
  #fd-bar a.fd-cta{padding:9px 12px;font-size:12.5px}
}
html.fd-hidden #fd-bar{display:none}

#fd-end{background:#15173A;color:#EEF0F7;padding:48px 20px 56px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;line-height:1.55}
#fd-end .fd-in{max-width:720px;margin:0 auto}
#fd-end .fd-kicker{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9EA2F2;margin:0 0 12px;font-weight:700}
#fd-end h2{font-size:clamp(24px,5vw,38px);line-height:1.1;color:#fff;margin:0 0 14px;font-weight:800;letter-spacing:-.02em}
#fd-end p{color:rgba(238,240,247,.82);margin:0 0 12px;font-size:16px;max-width:60ch}
#fd-end .fd-box{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:14px;
  padding:20px;margin:22px 0 0;display:grid;gap:14px}
#fd-end .fd-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px}
#fd-end .fd-line span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#9EA2F2;min-width:74px;font-weight:700}
#fd-end .fd-line a,#fd-end .fd-line b{color:#fff;font-size:18px;font-weight:700;text-decoration:none;word-break:break-word}
#fd-end .fd-line a:hover{text-decoration:underline}
#fd-end .fd-note{margin-top:20px;font-size:14px;color:rgba(238,240,247,.62)}
#fd-end h3{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9EA2F2;margin:30px 0 0;font-weight:700}
#fd-end ul.fd-svc{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:0;grid-template-columns:1fr}
#fd-end ul.fd-svc li{padding:13px 0;border-top:1px solid rgba(255,255,255,.12);font-size:15px;color:rgba(238,240,247,.78)}
#fd-end ul.fd-svc li b{display:block;color:#fff;font-size:16px;font-weight:700;margin-bottom:2px}
@media(min-width:680px){#fd-end ul.fd-svc{grid-template-columns:1fr 1fr;column-gap:32px}}
@media(max-width:640px){#fd-end{padding:36px 16px 44px}#fd-end .fd-box{padding:16px}}

/* Reply form */
#fd-end .fd-pick{display:grid;gap:10px;margin:24px 0 0;grid-template-columns:1fr}
@media(min-width:600px){#fd-end .fd-pick{grid-template-columns:repeat(3,1fr)}}
#fd-end .fd-pick button{font:inherit;font-size:15px;font-weight:700;color:#fff;background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:16px 14px;cursor:pointer;text-align:left;min-height:56px;line-height:1.3}
#fd-end .fd-pick button small{display:block;font-weight:400;font-size:13px;color:rgba(238,240,247,.65);margin-top:3px}
#fd-end .fd-pick button:hover{background:rgba(255,255,255,.14)}
#fd-end .fd-pick button[aria-pressed="true"]{background:#5E63E0;border-color:#5E63E0}
#fd-end .fd-pick button[aria-pressed="true"] small{color:rgba(255,255,255,.85)}
#fd-end form.fd-form{margin:18px 0 0}
#fd-end fieldset{border:0;margin:0;padding:0}
#fd-end .fd-panel{display:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  border-radius:14px;padding:20px;margin-top:14px}
#fd-end .fd-panel.on{display:block}
#fd-end legend,#fd-end .fd-lg{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9EA2F2;font-weight:700;margin:0 0 10px;display:block}
#fd-end label.fd-f{display:block;margin:0 0 12px}
#fd-end label.fd-f span{display:block;font-size:14px;color:rgba(238,240,247,.8);margin:0 0 5px}
#fd-end input[type=text],#fd-end input[type=email],#fd-end input[type=tel],#fd-end textarea,#fd-end select{
  width:100%;font:inherit;font-size:16px;color:#fff;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.22);
  border-radius:10px;padding:12px 13px;min-height:48px}
#fd-end textarea{min-height:96px;resize:vertical}
#fd-end input:focus,#fd-end textarea:focus,#fd-end select:focus{outline:2px solid #9EA2F2;outline-offset:1px}
#fd-end .fd-checks{display:grid;grid-template-columns:1fr;gap:2px;margin:0 0 12px}
@media(min-width:600px){#fd-end .fd-checks{grid-template-columns:1fr 1fr;column-gap:20px}}
#fd-end .fd-checks label{display:flex;gap:10px;align-items:flex-start;padding:9px 0;font-size:15px;
  color:rgba(238,240,247,.85);cursor:pointer;min-height:44px}
#fd-end .fd-checks input{flex:none;width:22px;height:22px;margin-top:1px;accent-color:#5E63E0}
#fd-end button.fd-send{font:inherit;font-size:16px;font-weight:700;color:#fff;background:#5E63E0;border:0;
  border-radius:11px;padding:15px 22px;cursor:pointer;min-height:52px;width:100%}
@media(min-width:600px){#fd-end button.fd-send{width:auto;min-width:240px}}
#fd-end button.fd-send:hover{background:#4348C7}
#fd-end button.fd-send[disabled]{opacity:.6;cursor:default}
#fd-end .fd-cheap{margin:14px 0 0;font-size:14px;color:rgba(238,240,247,.66)}
#fd-end .fd-thanks{display:none;background:rgba(63,179,155,.14);border:1px solid rgba(63,179,155,.45);
  border-radius:14px;padding:20px;margin-top:16px;color:#fff;font-size:16px}
#fd-end .fd-thanks.on{display:block}
#fd-end .fd-err{color:#FFB3C0;font-size:14px;margin:10px 0 0;display:none}
#fd-end .fd-err.on{display:block}
#fd-end .fd-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
`;

  const bar = `
<div id="fd-bar" role="complementary" aria-label="First Draft Studios">
  <i class="fd-dot" aria-hidden="true"></i>
  <span class="fd-txt"><b>A free first draft ${who}.</b> <span class="fd-long">Made by First Draft Studios. Everything on it can be changed to suit you.</span></span>
  <a class="fd-cta" href="#fd-end">Make it real</a>
  <button class="fd-x" type="button" aria-label="Hide this bar">&times;</button>
</div>`;

  const end = `
<section id="fd-end">
  <div class="fd-in">
    <p class="fd-kicker">From First Draft Studios, Windsor</p>
    <h2>Want this to be your real ${kit ? 'social media' : 'website'}?</h2>
    <p>We built ${kit ? 'these posts' : 'this page'} ${who} before you asked, at no cost and with no obligation.</p>
    <p><b style="color:#fff">This is a draft, so everything on it is still up for discussion.</b> We put it together from what we could find publicly: your ${kit ? 'photos, your reviews, and the way you already talk to customers' : 'menu, your hours, your reviews, and your photos'}. Every word, colour and picture is a suggestion you can change, replace, or throw out. Tell us what is wrong, what is missing, and what you would never say, and the next version will sound like you wrote it.</p>
    <p>If you like the direction, we finish it, put it on your own web address, and give you one fixed price in writing before anything starts. If you would rather not, that is the end of it and you owe nothing.</p>

    <h3>Other things we can look after</h3>
    <ul class="fd-svc">
      <li><b>More pages</b>A full menu, your story, a photo gallery, a jobs page, a contact form that emails you.</li>
      <li><b>Your web address</b>We buy it in your name, point it at the site, and it stays yours even if you leave us.</li>
      <li><b>Email at your own name</b>Something like hello@yourbusiness.ca, so you stop handing out a Gmail address.</li>
      <li><b>Hosting and upkeep</b>We keep it online, backed up, quick, and safe, and make small changes when you ask.</li>
      <li><b>Taking money online</b>Order ahead, pay a deposit, buy a gift card, book an appointment. The money lands in your account.</li>
      <li><b>Online ordering and booking</b>Either built in, or wired up to the service you already use.</li>
      <li><b>Social media posts</b>Written and designed for you every month, with the captions and hashtags ready to paste.</li>
      <li><b>Logo and look</b>A logo and a set of colours and type that carry across your sign, your menu, and your posts.</li>
      <li><b>Ads that run</b>Short videos and images for Facebook and Instagram, aimed at people near you.</li>
      <li><b>Showing up in search</b>Your hours, location, photos, and reviews set up so Google shows you properly.</li>
    </ul>
    <p style="margin-top:18px">Take all of it or none of it. Most people start with the website and add the rest later.</p>

    <h3 style="margin-top:34px">Tell us what you think</h3>
    <p style="margin-top:8px">One click is enough. There is no meeting to book and nobody will phone you out of the blue.</p>

    <div class="fd-pick">
      <button type="button" data-fd-intent="interested" aria-pressed="false">I am interested<small>Let's talk about finishing it</small></button>
      <button type="button" data-fd-intent="later" aria-pressed="false">Maybe later<small>Good idea, wrong time</small></button>
      <button type="button" data-fd-intent="no" aria-pressed="false">Not for me<small>We will stop here</small></button>
    </div>

    <form class="fd-form" method="post" action="/demo/${esc(slug)}/reply">
      <input type="hidden" name="intent" id="fd-intent" value="">
      <div class="fd-hp"><label>Company<input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>

      <div class="fd-panel" id="fd-yes">
        <span class="fd-lg">Which of these are you curious about?</span>
        <div class="fd-checks">
          ${['The website, finished', 'More pages', 'My own web address', 'Email at my business name', 'Hosting and upkeep', 'Taking payments or deposits online', 'Online ordering or booking', 'Social media posts', 'Logo and look', 'Ads on Facebook and Instagram', 'Showing up properly on Google', 'Not sure yet, talk me through it']
            .map((w, i) => `<label><input type="checkbox" name="wants" value="${esc(w)}" id="fdw${i}">${esc(w)}</label>`).join('')}
        </div>
        <label class="fd-f"><span>How soon are you thinking?</span>
          <select name="timing"><option value="">Pick one</option><option>As soon as you can</option><option>In the next month or two</option><option>Later this year</option><option>Just looking for now</option></select></label>
        <label class="fd-f"><span>Your name</span><input type="text" name="name" autocomplete="name"></label>
        <label class="fd-f"><span>Email we should reply to</span><input type="email" name="email" autocomplete="email"></label>
        <label class="fd-f"><span>Phone, if you would rather we call</span><input type="tel" name="phone" autocomplete="tel"></label>
        <label class="fd-f"><span>Anything you want changed, added, or taken off</span><textarea name="message" placeholder="The photos are old, the hours are wrong, we do not sell that any more, we want a page for catering."></textarea></label>
        <p class="fd-cheap">On price: we are a small studio in Windsor with almost no overhead, so what we charge tends to surprise people who have shopped around. You will see the exact number in writing before anything starts, and nothing begins until you agree to it.</p>
      </div>

      <div class="fd-panel" id="fd-later">
        <span class="fd-lg">No rush</span>
        <label class="fd-f"><span>When should we check back?</span>
          <select name="timing"><option value="">Pick one</option><option>In a month</option><option>In three months</option><option>After the busy season</option><option>Next year</option></select></label>
        <label class="fd-f"><span>Your name</span><input type="text" name="name" autocomplete="name"></label>
        <label class="fd-f"><span>Email we should use</span><input type="email" name="email" autocomplete="email"></label>
        <label class="fd-f"><span>Anything we should know for next time</span><textarea name="message"></textarea></label>
      </div>

      <div class="fd-panel" id="fd-no">
        <span class="fd-lg">That is completely fine</span>
        <p style="margin:0 0 12px">We will take the draft down and you will not hear from us again. If you can spare five seconds, it helps us do better next time.</p>
        <label class="fd-f"><span>Why, if you do not mind saying</span>
          <select name="reason"><option value="">Rather not say</option><option>We already have someone</option><option>We are happy with what we have</option><option>Too busy right now</option><option>The look is not right for us</option><option>We are closing or changing hands</option><option>Something else</option></select></label>
        <label class="fd-f"><span>Anything else</span><textarea name="message"></textarea></label>
      </div>

      <div class="fd-panel" id="fd-go" style="background:none;border:0;padding:0">
        <button class="fd-send" type="submit">Send this to First Draft Studios</button>
        <p class="fd-err" id="fd-err"></p>
      </div>
    </form>
    <div class="fd-thanks" id="fd-thanks"></div>

    <div class="fd-box" style="margin-top:26px">
      <div class="fd-line"><span>Email</span><a href="mailto:${esc(email)}?subject=${encodeURIComponent('About the draft for ' + (name || 'my business'))}">${esc(email)}</a></div>
      ${phone ? `<div class="fd-line"><span>Phone</span><a href="tel:${esc(tel)}">${esc(phone)}</a></div>` : ''}
      <div class="fd-line"><span>Website</span><a href="https://${esc(site)}" target="_blank" rel="noopener">${esc(site)}</a></div>
      <div class="fd-line"><span>Your draft</span><b>${esc(site)}/demo/${esc(slug)}/</b></div>
    </div>
    <p class="fd-note">This page is unlisted. It does not show up in Google and we have not sent it to anyone but you. Reply to our email, or write to the address above, and we will take it from there.</p>
  </div>
</section>`;

  const script = `
<script>(function(){
  var d=document,h=d.documentElement,bar=d.getElementById('fd-bar');
  if(!bar)return;
  var key='fd-hide-${esc(slug)}';
  try{ if(localStorage.getItem(key)==='1') h.className+=' fd-hidden'; }catch(e){}
  function pad(){
    if(h.className.indexOf('fd-hidden')>-1){ d.body.style.paddingTop=''; return; }
    var hgt=bar.offsetHeight;
    d.body.style.paddingTop=hgt+'px';
    // Nudge anything the page pins to the very top so the bar never covers it.
    var all=d.body.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.id==='fd-bar'||el.closest('#fd-bar')) continue;
      var s=getComputedStyle(el);
      if((s.position==='fixed'||s.position==='sticky')&&(s.top==='0px'||parseFloat(s.top)===0)){
        if(!el.hasAttribute('data-fd-top')) el.setAttribute('data-fd-top','1');
        el.style.top=hgt+'px';
      }
    }
  }
  bar.querySelector('.fd-x').addEventListener('click',function(){
    h.className+=' fd-hidden';
    try{localStorage.setItem(key,'1');}catch(e){}
    d.body.style.paddingTop='';
    var moved=d.querySelectorAll('[data-fd-top]');
    for(var i=0;i<moved.length;i++) moved[i].style.top='0px';
  });
  if(d.readyState==='complete') pad(); else addEventListener('load',pad);
  addEventListener('resize',pad,{passive:true});

  // Reply form. Works as a plain POST without JS; this only smooths it.
  var picks=d.querySelectorAll('#fd-end [data-fd-intent]'),
      fld=d.getElementById('fd-intent'), form=d.querySelector('#fd-end form.fd-form'),
      panels={interested:'fd-yes',later:'fd-later',no:'fd-no'},
      go=d.getElementById('fd-go'), err=d.getElementById('fd-err'), thanks=d.getElementById('fd-thanks');
  if(!picks.length||!form)return;
  for(var i=0;i<picks.length;i++)(function(btn){
    btn.addEventListener('click',function(){
      var want=btn.getAttribute('data-fd-intent');
      for(var j=0;j<picks.length;j++) picks[j].setAttribute('aria-pressed', picks[j]===btn?'true':'false');
      for(var k in panels){ var el=d.getElementById(panels[k]); if(el) el.className='fd-panel'+(k===want?' on':''); }
      fld.value=want; go.className='fd-panel on'; err.className='fd-err';
      go.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
  })(picks[i]);
  form.addEventListener('submit',function(e){
    if(!fld.value){ e.preventDefault(); err.textContent='Please choose one of the three buttons above first.'; err.className='fd-err on'; return; }
    if(!window.fetch||!window.FormData) return; // let the plain POST happen
    e.preventDefault();
    var btn=form.querySelector('.fd-send'); btn.disabled=true; btn.textContent='Sending...';
    fetch(form.action,{method:'POST',body:new FormData(form),headers:{'x-fd-ajax':'1'}})
      .then(function(r){return r.json();})
      .then(function(j){
        if(!j.ok) throw new Error(j.message||'That did not send.');
        form.style.display='none';
        d.querySelector('#fd-end .fd-pick').style.display='none';
        thanks.textContent=j.message; thanks.className='fd-thanks on';
        thanks.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      })
      .catch(function(x){
        btn.disabled=false; btn.textContent='Send this to First Draft Studios';
        err.textContent=x.message+' You can also just email us at ${esc(email)}.'; err.className='fd-err on';
      });
  });
})();<\/script>`;

  const blob = `<style>${css}</style>${bar}${end}${script}`;
  return html.includes('</body>') ? html.replace('</body>', blob + '</body>') : html + blob;
}
