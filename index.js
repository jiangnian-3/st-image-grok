import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, updateMessageBlock, getRequestHeaders } from '../../../../script.js';
import { appendMediaToMessage } from '../../../../script.js';
import { regexFromString } from '../../../utils.js';

var EXT='st-grok-imagine';var FOLDER=new URL('.',import.meta.url).pathname.replace(/\/$/,'')
var IT={DISABLED:'disabled',INLINE:'inline',REPLACE:'replace'};
var TF={pic:{regex:'/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g'},image:{regex:'/(?:<image>\\s*)?image###([\\s\\S]*?)###(?:\\s*<\\/image>)?/g'}};
var PRESETS={anime:{name:'anime',label:'\u52a8\u6f2b\u7cbe\u81f4',
        promptPrefix:'masterpiece, best quality, absurdres, anime artwork, anime style, vibrant colors, beautiful detailed eyes, detailed face, correct anatomy, correct hands',
        promptSuffix:'detailed background, sharp lines, clean lineart, studio lighting, dramatic shadows, high contrast, dynamic composition',
        injectionPrompt:"<image_generation>\nYou are a visual novel illustration engine. Insert<pic prompt=\\\"...\\\"> tags as scene illustrations.\nRules:\n- One<pic prompt=\\\"...\\\"> every 200-300 chars, between paragraphs. Min 3, max 4.\n- Use <imgthink> before each <pic> to analyze (hidden from reader). No quality tags in prompt.\n- SFW/NSFW: Default SFW. Clothed/underwear/swimsuit/hugging/kissing = SFW.\n  Only explicit nudity/sex = NSFW (add \\\"nsfw\\\" as first tag).\n<imgthink>- SFW or NSFW\n- Scene description\n- Characters count (1girl/1boy etc)\n- Camera angle\n- Clothing state\n- Expression\n- Environment</imgthink>\nTag format: English danbooru tags, comma separated.\n[nsfw if NSFW], character count, hair color+style, eye color, expression, pose, clothing details, character interaction, background, camera angle, lighting\nKeep character appearances consistent. Never repeat identical compositions.\n</image_generation>"},
    realistic:{name:'realistic',label:'\u771f\u4eba\u5199\u5b9e',
        promptPrefix:'masterpiece, best quality, absurdres, photorealistic, ultra realistic, RAW photo, 8k uhd, professional photography, correct anatomy, correct hands, detailed skin texture',
        promptSuffix:'sharp focus, natural lighting, film grain, bokeh, depth of field, DSLR, 85mm lens, cinematic composition',
        injectionPrompt:"<image_generation>\nYou are a professional photography engine. Insert <pic prompt=\\\"...\\\"> tags as photographic illustrations.\nRules:\n- One <pic prompt=\\\"...\\\"> every 200-300 chars. Min 3, max 4.\n- Use <imgthink> before each <pic> to plan (hidden from reader). No quality tags in prompt.\n- SFW/NSFW: Default SFW. Only explicit nudity/sex = NSFW (add \\\"nsfw\\\" as first tag).\n<imgthink>- SFW or NSFW\n- Subject and scene\n- Camera angle and framing\n- Clothing and styling\n- Expression and mood\n- Lighting and environment</imgthink>\nTag format: English photography descriptors, comma separated.\n[nsfw if NSFW], subject count, physical features (hair, eyes, body type, skin tone), expression, pose, clothing details, interaction, location, time of day, camera angle, lighting style\nKeep subject appearances consistent. Use cinematic framing.\n</image_generation>"},
    nsfw_enhanced:{name:'nsfw_enhanced',label:'\ud83d\udd1e NSFW\u589e\u5f3a',
        promptPrefix:'masterpiece, best quality, absurdres, anime artwork, detailed skin, shiny skin, wet skin, beautiful detailed eyes, detailed face, correct anatomy, correct hands',
        promptSuffix:'sweat, steam, dramatic lighting, dynamic angle, detailed skin texture, close-up details, vivid colors, high contrast',
        injectionPrompt:"<image_generation>\nYou are an adult visual novel illustration engine. Insert <pic prompt=\\\"...\\\"> tags as explicit scene illustrations.\nRules:\n- One <pic prompt=\\\"...\\\"> every 200-300 chars. Min 3, max 4.\n- Use <imgthink> before each <pic> to analyze (hidden from reader). No quality tags in prompt.\n- For any exposed body/sexual content, add \\\"nsfw\\\" as first tag.\n<imgthink>- SFW or NSFW\n- Most erotic/impactful moment\n- Characters and body positions\n- Camera angle for maximum visual impact\n- Clothing state (clothed/partially undressed/nude)\n- Expression (blush/ahegao/crying/pleasure)\n- Skin state (sweat/wet/shiny)\n- Environment</imgthink>\nTag format: English danbooru tags, comma separated.\nnsfw, character count (1girl/1boy), hair+eyes, expression (blush/half-closed eyes/open mouth/tears), body details (breasts/nipples/pussy/penis if visible), pose, clothing state (nude/topless/clothes pull/shirt lift), sexual action (sex/fellatio/cowgirl/missionary/from behind), body state (sweat/wet skin/shiny skin/cum), camera angle (from above/below/close-up/between legs), background, lighting\nPrioritize the most visually impactful angle. Keep appearances consistent.\n</image_generation>"}
}
var defaultSettings={insertType:IT.DISABLED,grokApi:{url:'https://new-api.zonde306.site/v1/chat/completions',key:'',model:'grok-imagine-1.0'},promptPrefix:PRESETS.anime.promptPrefix,promptSuffix:PRESETS.anime.promptSuffix,currentPreset:'anime',customPresets:{},tagFormat:'pic',cacheDays:7,imageLog:[],promptInjection:{enabled:true,prompt:PRESETS.anime.injectionPrompt,regex:TF.pic.regex,position:'deep_system',depth:0}};

//==================== Log ====================
var gLogs=[];
function addLog(m){var t=new Date().toLocaleTimeString('zh-CN',{hour12:false});gLogs.push('['+t+'] '+m);if(gLogs.length>80)gLogs.splice(0,gLogs.length-80);updLogUI();console.log('['+EXT+'] '+m);}
function updLogUI(){var el=$('#grok_log_area');if(!el.length)return;if(!gLogs.length){el.text('none');return;}el.html(gLogs.slice().reverse().map(function(l){return'<div style="padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-all;">'+l.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';}).join(''));}
function getLogText(){return gLogs.join('\n');}

// ==================== CSS ====================
var cssOK=false;
function injectCSS(){
if(cssOK)return;cssOK=true;
var s=document.createElement('style');s.id='grok-css';
s.textContent='.grok-wrap{position:relative !important;display:block !important;margin:10px 0 !important;border-radius:10px !important;overflow:hidden !important;line-height:0 !important;background:#111 !important;}'
+'.grok-wrap>img{width:100% !important;display:block !important;-webkit-touch-callout:none !important;-webkit-user-select:none !important;pointer-events:none !important;}'
+'.grok-ol{position:absolute !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;z-index:5 !important;cursor:pointer !important;-webkit-touch-callout:none !important;-webkit-user-select:none !important;user-select:none !important;}'
+'.grok-bar{position:absolute !important;bottom:0 !important;left:0 !important;right:0 !important;display:flex !important;align-items:center !important;justify-content:center !important;gap:24px !important;padding:20px 0 12px !important;background:linear-gradient(0deg,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.2) 70%,transparent 100%) !important;opacity:0 !important;transition:opacity .3s !important;pointer-events:none !important;z-index:6 !important;}'
+'.grok-wrap.bar-on>.grok-bar{opacity:1 !important;pointer-events:auto !important;}'
+'.gnb{background:rgba(255,255,255,0.12) !important;backdrop-filter:blur(12px) !important;-webkit-backdrop-filter:blur(12px) !important;color:rgba(255,255,255,0.85) !important;border:1px solid rgba(255,255,255,0.08) !important;border-radius:50% !important;width:42px !important;height:42px !important;font-size:20px !important;cursor:pointer !important;display:flex !important;align-items:center !important;justify-content:center !important;line-height:1 !important;}'
+'.gnb:active{background:rgba(255,255,255,0.25) !important;transform:scale(0.9) !important;}'
+'.gct{color:rgba(255,255,255,0.8) !important;font-size:14px !important;min-width:44px !important;text-align:center !important;text-shadow:0 1px 4px rgba(0,0,0,0.6) !important;}';
document.head.appendChild(s);
}

// ==================== Format ====================
function parseIC(raw){var t=raw.replace(/\n/g,' ').trim(),ss=t.split(';'),p=[];for(var i=0;i<ss.length;i++){var s=ss[i].trim();if(!s||/UC:/i.test(s))continue;s=s.replace(/^Scene Composition:/i,'').replace(/^Character\s*\d+\s*Prompt:/i,'').replace(/\|centers:[^;]*/gi,'').replace(/carry\|/gi,'').trim();if(s)p.push(s);}return p.join(',').replace(/,\s*,+/g,',').replace(/^\s*,|,\s*$/g,'').trim();}
function getRx(f,c){if(f==='custom')return c||TF.pic.regex;return TF[f]?TF[f].regex:TF.pic.regex;}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function unesc(v){return String(v||'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}

// ==================== Save ====================
async function saveImg(b64){try{var ctx=getContext(),fn='grok_'+Date.now()+'_'+Math.random().toString(36).substring(2,6);addLog('saveImg start len='+b64.length);var r=await fetch('/api/images/upload',{method:'POST',headers:getRequestHeaders(),body:JSON.stringify({image:b64,format:'jpg',filename:fn,ch_name:'grok-images'})});addLog('saveImg resp='+r.status);if(r.ok){var d=await r.json();var s=extension_settings[EXT];if(!s.imageLog)s.imageLog=[];s.imageLog.push({path:d.path,time:Date.now()});if(s.imageLog.length>500)s.imageLog.splice(0,s.imageLog.length-500);saveSettingsDebounced();addLog('saved:'+d.path);return'/user/images/grok-images/'+fn+'.jpg';}else{var t=await r.text().catch(function(){return'';});addLog('saveImg FAIL:'+r.status+' '+t.substring(0,200));}}catch(e){addLog('saveImg ERR:'+e.message);}return null;}
async function cleanCache(){var s=extension_settings[EXT];if(!s.imageLog||!s.imageLog.length){toastr.info('none');return;}var d=s.cacheDays||7;if(!d){toastr.info('never');return;}var c=Date.now()-d*86400000,k=[],dl=[];for(var i=0;i<s.imageLog.length;i++){if(s.imageLog[i].time<c)dl.push(s.imageLog[i]);else k.push(s.imageLog[i]);}if(!dl.length){toastr.info('none expired');return;}var ok=0;for(var i=0;i<dl.length;i++){try{var r=await fetch('/api/images/delete',{method:'POST',headers:getRequestHeaders(),body:JSON.stringify({path:dl[i].path})});if(r.ok)ok++;}catch(e){}}s.imageLog=k;saveSettingsDebounced();toastr.success('cleaned '+ok);}

// ==================== API ====================
function extractI(c){if(!c)return null;var b=c.match(/data:image\/[^;]+;base64,([A-Za-z0-9+\/=]+)/);if(b&&b[1])return{t:'b',d:b[1]};var u=c.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);if(u&&u[1])return{t:'u',d:u[1]};return null;}
async function genImg(prompt){var s=extension_settings[EXT],url=s.grokApi.url,key=s.grokApi.key,model=s.grokApi.model;
    if(!url||!key){toastr.error('Configure API');throw new Error('no config');}
    var parts=[];if(s.promptPrefix&&s.promptPrefix.trim())parts.push(s.promptPrefix.trim());parts.push(prompt);if(s.promptSuffix&&s.promptSuffix.trim())parts.push(s.promptSuffix.trim());
    var fp=parts.join(', ');addLog('API:'+fp.substring(0,100)+'...');
    var body={model:model,messages:[{role:'user',content:fp}],stream:false};
    var resp;
    try{
        resp=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(body)});
    }catch(e){
        addLog('direct failed, retry in 1s...');
        await new Promise(function(r){setTimeout(r,1000);});
        resp=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(body)});
    }
    if(!resp.ok){var t=await resp.text().catch(function(){return'';});throw new Error('API:'+resp.status+' '+t.substring(0,200));}
    var data=await resp.json();var content=data&&data.choices&&data.choices[0]&&data.choices[0].message?data.choices[0].message.content||'':'';
    var img=extractI(content);if(!img)throw new Error('No image');
    if(img.t==='b'){var p2=await saveImg(img.d);if(p2)return p2;return'data:image/jpeg;base64,'+img.d;}if(img.t==='u'){addLog('URL img, downloading...');try{var ir=await fetch(img.d);if(ir.ok){var bl=await ir.blob();var rd=new FileReader();var b64url=await new Promise(function(res){rd.onload=function(){res(rd.result);};rd.readAsDataURL(bl);});var rawB64=b64url.split(',')[1];if(rawB64){var p3=await saveImg(rawB64);if(p3)return p3;}}else{addLog('URL download fail:'+ir.status);}}catch(ue){addLog('URL download err:'+ue.message);}return img.d;}
    return img.d;
}

// ==================== History ====================
var gH={};
function getH(mid,pid){if(!gH[mid])gH[mid]={};if(!gH[mid][pid]){gH[mid][pid]={imgs:[],prms:[],idx:0};loadHistory(mid,pid);if(!gH[mid][pid].imgs.length){var el=document.querySelector('img[data-grok-mid="'+mid+'"][data-grok-pid="'+pid+'"]');if(el&&el.src){gH[mid][pid].imgs.push(el.src);gH[mid][pid].prms.push(unesc(el.getAttribute('data-grok-prompt')||''));gH[mid][pid].idx=0;}}}return gH[mid][pid];}
function saveHistory(mid,pid,h){try{var ctx=getContext();if(!ctx.chat[mid])return;if(!ctx.chat[mid].extra)ctx.chat[mid].extra={};if(!ctx.chat[mid].extra.grok_hist)ctx.chat[mid].extra.grok_hist={};ctx.chat[mid].extra.grok_hist[pid]={imgs:h.imgs,prms:h.prms,idx:h.idx};ctx.saveChat();}catch(e){addLog('saveHist err:'+e.message);}}
function loadHistory(mid,pid){try{var ctx=getContext();if(!ctx.chat[mid]||!ctx.chat[mid].extra||!ctx.chat[mid].extra.grok_hist)return;var d=ctx.chat[mid].extra.grok_hist[pid];if(d&&d.imgs&&d.imgs.length){gH[mid][pid]={imgs:d.imgs,prms:d.prms||[],idx:d.idx||0};}}catch(e){}}

// ==================== DOM Wrapping ====================
function wrapOneImg(img){
    if(img.closest('.grok-wrap'))return;
    if(img._grokW)return;
    img._grokW=true;
    var mid=img.getAttribute('data-grok-mid')||'0';
    var pid=img.getAttribute('data-grok-pid')||'0';
    var hist=getH(parseInt(mid),parseInt(pid));
    var total=Math.max(hist.imgs.length,1);
    var cur=(hist.idx||0)+1;
    var wrap=document.createElement('div');wrap.className='grok-wrap';wrap.setAttribute('data-grok-mid',mid);wrap.setAttribute('data-grok-pid',pid);
    var ol=document.createElement('div');ol.className='grok-ol';
    var bar=document.createElement('div');bar.className='grok-bar';
    bar.innerHTML='<div class="gnb" data-dir="prev">\u276E</div><div class="gct">'+cur+'/'+total+'</div><div class="gnb" data-dir="next">\u276F</div>';
    img.parentNode.insertBefore(wrap,img);
    wrap.appendChild(img);wrap.appendChild(ol);wrap.appendChild(bar);
    img._grokW=false;
}
function wrapAll(){injectCSS();document.querySelectorAll('img[data-grok-mid]').forEach(function(img){wrapOneImg(img);});}

// MutationObserver
var gObs=null;
function startObs(){
    if(gObs)return;
    var chat=document.getElementById('chat');if(!chat)return;
    gObs=new MutationObserver(function(muts){
        var found=false;
        for(var i=0;i<muts.length&&!found;i++){
            var added=muts[i].addedNodes;
            for(var j=0;j<added.length&&!found;j++){
                var n=added[j];if(n.nodeType!==1)continue;
                if(n.tagName==='IMG'&&n.hasAttribute('data-grok-mid')){found=true;}else if(n.querySelectorAll){if(n.querySelectorAll('img[data-grok-mid]').length)found=true;}
            }
        }
        if(found){clearTimeout(gObs._d);gObs._d=setTimeout(wrapAll,80);}
    });
    gObs.observe(chat,{childList:true,subtree:true});
}

function refreshWrap(mid,pid){
    var hist=getH(mid,pid);if(!hist.imgs.length)return;
    var idx=hist.idx;
    var wrap=document.querySelector('.grok-wrap[data-grok-mid="'+mid+'"][data-grok-pid="'+pid+'"]');
    if(!wrap)return;
    var img=wrap.querySelector('img');
    if(img){img.src=hist.imgs[idx];img.setAttribute('data-grok-prompt',esc(hist.prms[idx]));}
    var ct=wrap.querySelector('.gct');
    if(ct)ct.textContent=(idx+1)+'/'+hist.imgs.length;
}

// ==================== Touch/Click ====================
var lpT=null,lpF=false,lastTap=0,tapTimer=null;

$(document).on("touchstart",".grok-ol",function(e){e.preventDefault();e.stopPropagation();var el=this;lpF=false;lpT=setTimeout(function(){lpF=true;addLog("longpress fired");showEdit(el.parentNode);},600);});
$(document).on('touchend','.grok-ol',function(e){e.preventDefault();e.stopPropagation();if(lpT){clearTimeout(lpT);lpT=null;}if(!lpF){var now=Date.now(),w=$(this).closest('.grok-wrap');if(now-lastTap<300){lastTap=0;if(tapTimer){clearTimeout(tapTimer);tapTimer=null;}showFullscreen(w);}else{lastTap=now;var tw=w;tapTimer=setTimeout(function(){tw.toggleClass('bar-on');if(tw.hasClass('bar-on')){clearTimeout(tw.data('ht'));tw.data('ht',setTimeout(function(){tw.removeClass('bar-on');},4000));}tapTimer=null;},300);}}lpF=false;});
$(document).on('touchmove',function(){if(lpT){clearTimeout(lpT);lpT=null;}});
$(document).on('click','.grok-ol',function(e){e.preventDefault();e.stopPropagation();});
$(document).on('contextmenu','.grok-ol',function(e){e.preventDefault();return false;});
$(document).on('click','.gnb',function(e){e.preventDefault();e.stopPropagation();var w=$(this).closest('.grok-wrap');var mid=parseInt(w.attr('data-grok-mid'));var pid=parseInt(w.attr('data-grok-pid'));var hist=getH(mid,pid);if($(this).data('dir')==='prev')hist.idx=hist.idx>0?hist.idx-1:hist.imgs.length-1;else hist.idx=hist.idx<hist.imgs.length-1?hist.idx+1:0;refreshWrap(mid,pid);clearTimeout(w.data('ht'));w.data('ht',setTimeout(function(){w.removeClass('bar-on');},4000));});


//==================== Image Manager ====================
function showImageManager(){
    addLog('imgmgr opened');try{
    $('#grok-imgmgr').remove();
    var s=extension_settings[EXT];
    var logs=(s.imageLog||[]).slice().reverse();
    var sel=new Set();
    var PAGE=12,page=0,totalPages=Math.max(1,Math.ceil(logs.length/PAGE));
    var ov=$('<div id="grok-imgmgr" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:200001;display:flex;flex-direction:column;"></div>');
    var hdr=$('<div></div>').css({display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid #333',flexShrink:0});
    hdr.append($('<h3 id="grok-mgr-title"></h3>').text('图片管理 ('+logs.length+')').css({margin:0,color:'#ccc',fontSize:'16px'}));
    var closeBtn=$('<button>✕</button>').css({background:'none',border:'none',color:'#ccc',fontSize:'20px',cursor:'pointer'});
    closeBtn.on('click',function(){ov.remove();});
    hdr.append(closeBtn);ov.append(hdr);
    var grid=$('<div id="grok-imgmgr-grid"></div>').css({flex:1,overflowY:'auto',padding:'8px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px',alignContent:'start'});
    ov.append(grid);
    var pager=$('<div></div>').css({display:'flex',alignItems:'center',justifyContent:'center',gap:'16px',padding:'8px',borderTop:'1px solid #333',flexShrink:0});
    var prevBtn=$('<button>\u25C0</button>').css({padding:'8px 16px',borderRadius:'8px',border:'none',background:'rgba(255,255,255,0.12)',color:'#ccc',fontSize:'14px',cursor:'pointer'});
    var pageText=$('<span></span>').css({color:'#ccc',fontSize:'13px',minWidth:'60px',textAlign:'center'});
    var nextBtn=$('<button>\u25B6</button>').css({padding:'8px 16px',borderRadius:'8px',border:'none',background:'rgba(255,255,255,0.12)',color:'#ccc',fontSize:'14px',cursor:'pointer'});
    var jumpInput=$('<input>').attr({type:'number',min:1,max:totalPages,placeholder:'#'}).css({width:'48px',padding:'6px',borderRadius:'8px',border:'1px solid #555',background:'#1a1a1a',color:'#ccc',fontSize:'13px',textAlign:'center'});
    var jumpBtn=$('<button>跳转</button>').css({padding:'6px 12px',borderRadius:'8px',border:'none',background:'rgba(255,255,255,0.12)',color:'#ccc',fontSize:'13px',cursor:'pointer'});
    jumpBtn.on('click',function(){var v=parseInt(jumpInput.val());if(v>=1&&v<=totalPages){page=v-1;renderPage();}else{toastr.warning('1-'+totalPages);}});
    pager.append(prevBtn).append(pageText).append(nextBtn).append(jumpInput).append(jumpBtn);
    ov.append(pager);
    function renderPage(){
        grid.empty();grid.scrollTop(0);
        var start=page*PAGE,end=Math.min(start+PAGE,logs.length);
        pageText.text((page+1)+'/'+totalPages);
        prevBtn.css('opacity',page>0?1:0.3);
        nextBtn.css('opacity',page<totalPages-1?1:0.3);
        if(!logs.length){grid.append($('<div></div>').css({gridColumn:'1/-1',textAlign:'center',color:'#888',padding:'40px 0'}).text('暂无缓存图片'));return;}
        for(var i=start;i<end;i++){(function(idx,item){
            var card=$('<div class="grok-mgr-card"></div>').css({position:'relative',borderRadius:'8px',overflow:'hidden',background:'#1a1a1a',aspectRatio:'1',cursor:'pointer'});
            var img=$('<img>').attr('src',item.path).attr('loading','lazy').css({width:'100%',height:'100%',objectFit:'cover',display:'block'});
            img.on('error',function(){$(this).replaceWith($('<div></div>').css({width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#555',fontSize:'11px'}).text('已删除'));});
            var cb=$('<div class="grok-mgr-cb"></div>').css({position:'absolute',top:'4px',right:'4px',width:'24px',height:'24px',borderRadius:'50%',border:'2px solid rgba(255,255,255,0.6)',background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',color:'#fff',zIndex:2});
            if(sel.has(idx))cb.text('\u2713').css({background:'#4a9eff',border:'2px solid #4a9eff'});
            var info=$('<div></div>').css({position:'absolute',bottom:0,left:0,right:0,background:'linear-gradient(transparent,rgba(0,0,0,0.7))',padding:'4px 6px',fontSize:'10px',color:'#aaa'}).text(new Date(item.time).toLocaleDateString());
            cb.on('click touchend',function(e){e.stopPropagation();e.preventDefault();if(sel.has(idx)){sel.delete(idx);$(this).text('').css({background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.6)'});}else{sel.add(idx);$(this).text('\u2713').css({background:'#4a9eff',border:'2px solid #4a9eff'});}updBar();});
            card.on('click touchend',function(e){if($(e.target).closest('.grok-mgr-cb').length)return;e.preventDefault();showFullImg(item.path);});
            card.append(img).append(cb).append(info);grid.append(card);
        })(i,logs[i]);}
    }
    prevBtn.on('click',function(){if(page>0){page--;renderPage();}});
    nextBtn.on('click',function(){if(page<totalPages-1){page++;renderPage();}});
    var bar=$('<div id="grok-imgmgr-bar"></div>').css({display:'flex',alignItems:'center',gap:'8px',padding:'10px 12px',borderTop:'1px solid #333',flexShrink:0,flexWrap:'wrap',justifyContent:'center'});
    var selAllBtn=$('<button>全选</button>').css({padding:'8px 14px',borderRadius:'8px',border:'none',background:'rgba(255,255,255,0.12)',color:'#ccc',fontSize:'13px',cursor:'pointer'});
    var dlBtn=$('<button>下载</button>').css({padding:'8px 14px',borderRadius:'8px',border:'none',background:'#2d7d46',color:'#fff',fontSize:'13px',cursor:'pointer'});
    var delBtn=$('<button>删除</button>').css({padding:'8px 14px',borderRadius:'8px',border:'none',background:'#c0392b',color:'#fff',fontSize:'13px',cursor:'pointer'});
    var countTxt=$('<span></span>').css({color:'#888',fontSize:'12px'}).text('已选 0');
    function updBar(){countTxt.text('已选 '+sel.size);}
    selAllBtn.on('click',function(){if(sel.size===logs.length){sel.clear();}else{for(var j=0;j<logs.length;j++)sel.add(j);}renderPage();updBar();});
    dlBtn.on('click',function(){if(!sel.size){toastr.warning('未选择');return;}var cnt=0;sel.forEach(function(idx){var item=logs[idx];if(!item)return;var a=document.createElement('a');a.href=item.path;a.download=item.path.split('/').pop();document.body.appendChild(a);a.click();document.body.removeChild(a);cnt++;});toastr.success('下载 '+cnt+' 张');});
    delBtn.on('click',async function(){if(!sel.size){toastr.warning('未选择');return;}if(!confirm('确认删除 '+sel.size+' 张？'))return;delBtn.prop('disabled',true).text('删除中...');var ok=0,idxArr=Array.from(sel).sort(function(a,b){return b-a;});for(var k=0;k<idxArr.length;k++){var item=logs[idxArr[k]];if(!item)continue;try{var r=await fetch('/api/images/delete',{method:'POST',headers:getRequestHeaders(),body:JSON.stringify({path:item.path})});if(r.ok)ok++;}catch(e){}var realIdx=s.imageLog.length-1-idxArr[k];if(realIdx>=0)s.imageLog.splice(realIdx,1);}saveSettingsDebounced();toastr.success('已删除 '+ok+' 张');ov.remove();showImageManager();});
    bar.append(selAllBtn).append(dlBtn).append(delBtn).append(countTxt);
    ov.append(bar);
    $('body').append(ov);renderPage();
    }catch(e){addLog('imgmgr ERR:'+e.message);toastr.error('imgmgr:'+e.message);}
}

function showFullImg(src){
    addLog('preview: '+src.substring(0,60));
    $('#grok-fullimg-view').remove();
    var ov=$('<div id="grok-fullimg-view" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:200002;display:flex;align-items:center;justify-content:center;"></div>');
    var img=$('<img>').attr('src',src).css({
        maxWidth:'100%',maxHeight:'100%',objectFit:'contain',
        WebkitTouchCallout:'default',WebkitUserSelect:'auto',pointerEvents:'auto'
    });
    ov.append(img);
    $('body').append(ov);
    addLog('preview appended h='+ov.height());
    setTimeout(function(){
        ov.on('click touchend',function(e){e.preventDefault();ov.remove();addLog('preview closed');});
    },500);
}

//==================== Fullscreen Viewer ====================
function showFullscreen(wrapEl){
    $('#grok-fullscreen').remove();
    var el=wrapEl instanceof jQuery?wrapEl:$(wrapEl);
    var img=el.find('img')[0];
    if(!img||!img.src)return;
    var src=img.src;
    var ov=$('<div id="grok-fullscreen"></div>').css({
        position:'fixed',top:0,left:0,width:'100vw',height:'100vh',
        background:'rgba(0,0,0,0.95)',zIndex:200000,
        display:'flex',alignItems:'center',justifyContent:'center',
        padding:0,margin:0
    });
    var fimg=$('<img>').attr('src',src).css({
        maxWidth:'100%',maxHeight:'100%',objectFit:'contain',
        WebkitTouchCallout:'default',WebkitUserSelect:'auto',userSelect:'auto',pointerEvents:'auto'
    });
    ov.append(fimg);
    $('body').append(ov);
    addLog('fullscreen opened');
    // close on tap background (delay to avoid instant close from double-tap)
    setTimeout(function(){
        ov.on('click touchend',function(e){
            if(e.target===ov[0]){ov.remove();addLog('fullscreen closed');}
        });fimg.on('click',function(){ov.remove();addLog('fullscreen closed by img tap');});
    },500);
}

//==================== Edit Dialog ====================
function showEdit(wrapEl){
    injectCSS();
    var x=document.getElementById('grok-edit-overlay');if(x)x.remove();var x2=document.getElementById('grok-edit-box');if(x2)x2.remove();
    var img=wrapEl.querySelector('img');if(!img)return;
    var mid=img.getAttribute('data-grok-mid')||'0';
    var pid=img.getAttribute('data-grok-pid')||'0';
    var _h=getH(parseInt(mid),parseInt(pid));
    var cp=(_h.prms.length>0)?_h.prms[_h.idx]:unesc(img.getAttribute('data-grok-prompt')||'');
    addLog('edit: '+cp.substring(0,60));
    var vw=window.innerWidth,vh=window.innerHeight;
    var bw=Math.min(Math.floor(vw*0.88),440);
    var bh=Math.min(Math.floor(vh*0.55),380);
    var bl=Math.floor((vw-bw)/2);
    var bt=Math.floor((vh-bh)/2);
    var ov=document.createElement('div');
    ov.id='grok-edit-overlay';
    ov.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:99998;margin:0;padding:0;';
    var box=document.createElement('div');
    box.style.cssText='position:fixed;top:'+bt+'px;left:'+bl+'px;width:'+bw+'px;max-height:'+bh+'px;background:#2a2a2a;border-radius:14px;padding:16px;overflow-y:auto;color:#ccc;z-index:99999;box-sizing:border-box;';
    var ta=document.createElement('textarea');
    ta.id='grok-ep';
    ta.style.cssText='width:100%;min-height:70px;max-height:'+Math.floor(bh*0.5)+'px;background:#1a1a1a;color:#ccc;border:1px solid #555;border-radius:8px;padding:10px;font-size:13px;resize:vertical;box-sizing:border-box;display:block;margin-top:10px;';
    var h3=document.createElement('h3');
    h3.textContent='Edit Prompt';
    h3.style.cssText='margin:0;font-size:15px;color:#ccc;';
    var btns=document.createElement('div');
    btns.style.cssText='display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';
    var bcn=document.createElement('button');
    bcn.textContent='Cancel';
    bcn.style.cssText='padding:10px 18px;border-radius:8px;border:none;cursor:pointer;font-size:14px;background:rgba(255,255,255,0.15);color:#ccc;';
    var brg=document.createElement('button');
    brg.textContent='Regen';
    brg.id='grok-er';
    brg.style.cssText='padding:10px 18px;border-radius:8px;border:none;cursor:pointer;font-size:14px;background:#4a9eff;color:#fff;';
    btns.appendChild(bcn);btns.appendChild(brg);
    box.appendChild(h3);box.appendChild(ta);box.appendChild(btns);
    box.id='grok-edit-box';document.body.appendChild(ov);document.body.appendChild(box);
    ta.value=cp;
    addLog('editbox pos t='+bt+' l='+bl+' w='+bw+' h='+bh);
    function closeEdit(){ov.remove();box.remove();}
    ov.addEventListener('click',closeEdit);
    bcn.addEventListener('click',closeEdit);
    brg.addEventListener('click',async function(){
        var np=ta.value.trim();
        if(!np){toastr.warning('empty');return;}
        addLog('regen: '+np.substring(0,60));
        brg.disabled=true;brg.textContent='...';
        try{
            var result=await genImg(np);
            if(result){
                var mId=parseInt(mid),pId=parseInt(pid);
                var hist=getH(mId,pId);hist.imgs.push(result);hist.prms.push(np);hist.idx=hist.imgs.length-1;
                refreshWrap(mId,pId);saveHistory(mId,pId,hist);
                var ctx=getContext();
                if(ctx.chat[mId]){ctx.chat[mId].mes=ctx.chat[mId].mes.replace(new RegExp('<img[^>]*data-grok-pid="'+pId+'"[^>]*>'),'<img class="grok-gen-img" src="'+result+'" data-grok-prompt="'+esc(np)+'" data-grok-mid="'+mId+'" data-grok-pid="'+pId+'">');await ctx.saveChat();}
                setTimeout(wrapAll,200);addLog('edit ok['+mId+':'+pId+']');toastr.success('done');
            }
        }catch(err){toastr.error(err.message);addLog('edit fail:'+err.message);}
        closeEdit();
    });
}


// Retry click (inline styled span survives markdown)
$(document).on('click','span[data-grok-retry]',async function(e){
    e.preventDefault();
    var el=$(this);var prompt=unesc(el.attr('data-grok-prompt')||'');
    var mid=parseInt(el.attr('data-grok-mid'));var pid=parseInt(el.attr('data-grok-pid'));
    el.text('generating...');
    try{
        var result=await genImg(prompt);
        if(result){
            var hist=getH(mid,pid);hist.imgs.push(result);hist.prms.push(prompt);hist.idx=hist.imgs.length-1;saveHistory(mid,pid,hist);
            var newTag='<img class="grok-gen-img" src="'+result+'" data-grok-prompt="'+esc(prompt)+'" data-grok-mid="'+mid+'" data-grok-pid="'+pid+'">';
            var ctx=getContext();
            if(ctx.chat[mid]){
                ctx.chat[mid].mes=ctx.chat[mid].mes.replace(/<span[^>]*data-grok-retry="1"[^>]*data-grok-pid="[\s\S]*?<\/span>/,newTag);
                updateMessageBlock(mid,ctx.chat[mid]);setTimeout(wrapAll,200);await ctx.saveChat();
            }
            addLog('retry ok['+mid+':'+pid+']');toastr.success('retry ok');
        }
    }catch(err){el.text('\u21bb retry | '+prompt.substring(0,40));addLog('retry fail:'+err.message);}
});

// ==================== Presets ====================
function getAllP(){var s=extension_settings[EXT],a={};for(var k in PRESETS)a[k]=PRESETS[k];if(s.customPresets)for(var k in s.customPresets)a[k]=s.customPresets[k];return a;}
function updatePDD(){var s=extension_settings[EXT],sel=$('#grok_preset_select');sel.empty();var a=getAllP();for(var k in a)sel.append($('<option></option>').val(k).text(a[k].label||k).attr('selected',k===s.currentPreset));}
function applyP(n){var s=extension_settings[EXT],a=getAllP(),p=a[n];if(!p)return;s.currentPreset=n;s.promptPrefix=p.promptPrefix||'';s.promptSuffix=p.promptSuffix||'';s.promptInjection.prompt=p.injectionPrompt||'';if(p.tagFormat){s.tagFormat=p.tagFormat;s.promptInjection.regex=getRx(p.tagFormat,p.customRegex);}updateUI();saveSettingsDebounced();toastr.success(p.label||n);}
function newP(){var n=prompt('新预设名称:');if(!n||!n.trim())return;var s=extension_settings[EXT],k=n.trim().toLowerCase().replace(/\s+/g,'_');if(PRESETS[k]){toastr.warning('不能覆盖内置预设');return;}if(!s.customPresets)s.customPresets={};s.customPresets[k]={name:k,label:(s.customPresets[k]&&s.customPresets[k].label)||k,promptPrefix:s.promptPrefix||'',promptSuffix:s.promptSuffix||'',injectionPrompt:s.promptInjection.prompt||'',tagFormat:s.tagFormat,customRegex:s.promptInjection.regex};s.currentPreset=k;updatePDD();saveSettingsDebounced();toastr.success('新预设 "'+n.trim()+'" 已创建');}
function saveP(){var s=extension_settings[EXT],c=s.currentPreset;if(!c){toastr.warning('先选择预设');return;}if(PRESETS[c]){toastr.warning('不能覆盖内置预设，请用➕新建');return;}var k=c;if(!s.customPresets)s.customPresets={};s.customPresets[k]={name:k,label:n.trim(),promptPrefix:s.promptPrefix||'',promptSuffix:s.promptSuffix||'',injectionPrompt:s.promptInjection.prompt||'',tagFormat:s.tagFormat,customRegex:s.promptInjection.regex};s.currentPreset=k;updatePDD();saveSettingsDebounced();toastr.success('saved');}
function delP(){var s=extension_settings[EXT],c=s.currentPreset;if(PRESETS[c]){toastr.warning('builtin');return;}if(!s.customPresets||!s.customPresets[c])return;delete s.customPresets[c];s.currentPreset='anime';applyP('anime');saveSettingsDebounced();}
function expP(){var s=extension_settings[EXT];var d={version:'2.2',currentPreset:s.currentPreset,customPresets:s.customPresets||{},tagFormat:s.tagFormat,current:{promptPrefix:s.promptPrefix,promptSuffix:s.promptSuffix,injectionPrompt:s.promptInjection.prompt,regex:s.promptInjection.regex}};var b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='grok-presets.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}
function impP(file){var r=new FileReader();r.onload=function(e){try{var d=JSON.parse(e.target.result);var s=extension_settings[EXT];if(d.customPresets){if(!s.customPresets)s.customPresets={};for(var k in d.customPresets)s.customPresets[k]=d.customPresets[k];}if(d.current){if(d.current.promptPrefix!==undefined)s.promptPrefix=d.current.promptPrefix;if(d.current.promptSuffix!==undefined)s.promptSuffix=d.current.promptSuffix;if(d.current.injectionPrompt!==undefined)s.promptInjection.prompt=d.current.injectionPrompt;if(d.current.regex!==undefined)s.promptInjection.regex=d.current.regex;}if(d.tagFormat)s.tagFormat=d.tagFormat;if(d.currentPreset)s.currentPreset=d.currentPreset;updateUI();updatePDD();saveSettingsDebounced();toastr.success('imported');}catch(err){toastr.error('fail');}};r.readAsText(file);}

// ==================== Settings ====================
function updateUI(){var s=extension_settings[EXT];$('#grok_auto_gen_btn').toggleClass('selected',s.insertType!==IT.DISABLED);if(!$('#grok_insert_type').length)return;$('#grok_insert_type').val(s.insertType);$('#grok_api_url').val(s.grokApi.url);$('#grok_api_key').val(s.grokApi.key);$('#grok_model').val(s.grokApi.model);$('#grok_prompt_prefix').val(s.promptPrefix);$('#grok_prompt_suffix').val(s.promptSuffix||'');$('#grok_tag_format').val(s.tagFormat||'pic');$('#grok_injection_enabled').prop('checked',s.promptInjection.enabled);$('#grok_injection_prompt').val(s.promptInjection.prompt);$('#grok_injection_regex').val(s.promptInjection.regex);$('#grok_injection_regex').prop('readonly',s.tagFormat!=='custom');$('#grok_injection_position').val(s.promptInjection.position);$('#grok_injection_depth').val(s.promptInjection.depth);$('#grok_cache_days').val(s.cacheDays||7);$('#grok_stream_pregen').prop('checked',s.streamPregen!==false);updatePDD();updLogUI();}

async function loadSettings(){extension_settings[EXT]=extension_settings[EXT]||{};var s=extension_settings[EXT];if(Object.keys(s).length===0)Object.assign(s,defaultSettings);else{if(!s.grokApi)s.grokApi=Object.assign({},defaultSettings.grokApi);if(!s.promptInjection)s.promptInjection=Object.assign({},defaultSettings.promptInjection);for(var k in defaultSettings.grokApi)if(s.grokApi[k]===undefined)s.grokApi[k]=defaultSettings.grokApi[k];for(var k in defaultSettings.promptInjection)if(s.promptInjection[k]===undefined)s.promptInjection[k]=defaultSettings.promptInjection[k];if(s.insertType===undefined)s.insertType=defaultSettings.insertType;if(s.promptPrefix===undefined)s.promptPrefix=defaultSettings.promptPrefix;if(s.promptSuffix===undefined)s.promptSuffix=defaultSettings.promptSuffix;if(s.currentPreset===undefined)s.currentPreset=defaultSettings.currentPreset;if(s.customPresets===undefined)s.customPresets={};if(s.tagFormat===undefined)s.tagFormat='pic';if(s.cacheDays===undefined)s.cacheDays=7;if(s.streamPregen===undefined)s.streamPregen=true;if(!s.imageLog)s.imageLog=[];}updateUI();}

async function createSettings(html){
    if(!$('#grok_imagine_container').length)$('#extensions_settings2').append('<div id="grok_imagine_container" class="extension_container"></div>');
    $('#grok_imagine_container').empty().append(html);var s=extension_settings[EXT];
    $('#grok_insert_type').on('change',function(){s.insertType=$(this).val();updateUI();saveSettingsDebounced();});
    $('#grok_api_url').on('input',function(){s.grokApi.url=$(this).val();saveSettingsDebounced();});
    $('#grok_api_key').on('input',function(){s.grokApi.key=$(this).val();saveSettingsDebounced();});
    $('#grok_model').on('input',function(){s.grokApi.model=$(this).val();saveSettingsDebounced();});
    $('#grok_prompt_prefix').on('input',function(){s.promptPrefix=$(this).val();saveSettingsDebounced();});
    $('#grok_prompt_suffix').on('input',function(){s.promptSuffix=$(this).val();saveSettingsDebounced();});
    $('#grok_tag_format').on('change',function(){var f=$(this).val();s.tagFormat=f;s.promptInjection.regex=getRx(f,s.promptInjection.regex);updateUI();saveSettingsDebounced();});
    $('#grok_injection_enabled').on('change',function(){s.promptInjection.enabled=$(this).prop('checked');saveSettingsDebounced();});
    $('#grok_injection_prompt').on('input',function(){s.promptInjection.prompt=$(this).val();saveSettingsDebounced();});
    $('#grok_injection_regex').on('input',function(){if(s.tagFormat==='custom'){s.promptInjection.regex=$(this).val();saveSettingsDebounced();}});
    $('#grok_injection_position').on('change',function(){s.promptInjection.position=$(this).val();saveSettingsDebounced();});
    $('#grok_injection_depth').on('input',function(){var v=parseInt(String($(this).val()));s.promptInjection.depth=isNaN(v)?0:v;saveSettingsDebounced();});
    $('#grok_stream_pregen').on('change',function(){s.streamPregen=$(this).prop('checked');saveSettingsDebounced();addLog('streamPregen='+(s.streamPregen?'ON':'OFF'));});
    $('#grok_cache_days').on('change',function(){s.cacheDays=parseInt($(this).val());saveSettingsDebounced();});
    $('#grok_clean_cache').on('click',cleanCache);
    $('#grok_manage_images').on('click',showImageManager);
    $('#grok_clear_log').on('click',function(){gLogs=[];updLogUI();});
    $('#grok_copy_log').on('click',function(){navigator.clipboard.writeText(getLogText()).then(function(){toastr.success('copied');}).catch(function(){var ta=document.createElement('textarea');ta.value=getLogText();document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toastr.success('copied');});});
    $('#grok_download_log').on('click',function(){var b=new Blob([getLogText()],{type:'text/plain'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='grok-log.txt';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);});
    $('#grok_preset_select').on('change',function(){applyP($(this).val());});
    $('#grok_preset_new').on('click',newP);$('#grok_preset_save').on('click',saveP);$('#grok_preset_delete').on('click',delP);$('#grok_preset_export').on('click',expP);
    $('#grok_preset_import').on('click',function(){$('#grok_preset_import_file').trigger('click');});
    $('#grok_preset_import_file').on('change',function(e){if(e.target.files&&e.target.files[0]){impP(e.target.files[0]);e.target.value='';}});
    updateUI();
}

// ==================== Init ====================
function onBtn(){var d=$('#extensions-settings-button .drawer-toggle');if($('#rm_extensions_block').hasClass('closedDrawer'))d.trigger('click');setTimeout(function(){var c=$('#grok_imagine_container');if(c.length){$('#rm_extensions_block').animate({scrollTop:c.offset().top-$('#rm_extensions_block').offset().top+$('#rm_extensions_block').scrollTop()},500);var dc=c.find('.inline-drawer-content'),dh=c.find('.inline-drawer-header');if(dc.is(':hidden')&&dh.length)dh.trigger('click');}},500);}
$(function(){(async function(){
    try{console.log('[grok] FOLDER='+FOLDER);
    console.log('[grok] meta.url='+import.meta.url);
    var html=await $.get(FOLDER+'/settings.html');
    console.log('[grok] HTML loaded len='+html.length);
    $('#extensionsMenu').append('<div id="grok_auto_gen_btn" class="list-group-item flex-container flexGap5"><div class="fa-solid fa-image"></div><span>Grok Imagine</span></div>');
    $('#grok_auto_gen_btn').off('click').on('click',onBtn);
    await loadSettings();await createSettings(html);
    console.log('[grok] presets='+JSON.stringify(Object.keys(getAllP())));
    console.log('[grok] customPresets='+JSON.stringify(Object.keys(extension_settings[EXT].customPresets||{})));
    addLog('v2.5.1');setTimeout(function(){startObs();wrapAll();},500);
    }catch(e){console.error('[grok] INIT FAIL:',e);}
})();});

// ==================== Injection ====================
function getRole(){var s=extension_settings[EXT];if(!s||!s.promptInjection)return'system';switch(s.promptInjection.position){case'deep_user':return'user';case'deep_assistant':return'assistant';default:return'system';}}
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY,async function(ev){try{var s=extension_settings[EXT];if(!s||!s.promptInjection||!s.promptInjection.enabled||s.insertType===IT.DISABLED)return;var p=s.promptInjection.prompt,d=s.promptInjection.depth||0,r=getRole();if(d===0)ev.chat.push({role:r,content:p});else ev.chat.splice(-d,0,{role:r,content:p});addLog('inject '+r+' d='+d);}catch(e){}});

// ==================== Message Handler ====================
eventSource.on(event_types.MESSAGE_RECEIVED,handleMsg);
async function handleMsg(){
    var _savedPG=Object.assign({},_preGens);var _wasPG=_preGenActive;
    _streamBuf='';_preGenActive=false;_preGens={};_streamLastLen=0;
    var s=extension_settings[EXT];if(!s||s.insertType===IT.DISABLED)return;
    if(_wasPG)addLog('\u26a1msg received, '+Object.keys(_savedPG).length+' pre-gens available');
    var ctx=getContext(),mesIdx=ctx.chat.length-1,msg=ctx.chat[mesIdx];
    if(!msg||msg.is_user)return;

    var thinks=msg.mes.match(/<imgthink>[\s\S]*?<\/imgthink>/g);
    if(thinks){for(var t=0;t<thinks.length;t++){addLog('think#'+(t+1)+':'+thinks[t].replace(/<\/?imgthink>/g,'').trim().substring(0,120));}
    msg.mes=msg.mes.replace(/<imgthink>[\s\S]*?<\/imgthink>\s*/g,'');updateMessageBlock(mesIdx,msg);}

    var rxStr=s.promptInjection.regex;if(!rxStr)return;
    var rx;try{rx=regexFromString(rxStr);}catch(e){return;}
    var matches;if(rx.global){matches=Array.from(msg.mes.matchAll(rx));}else{var m=msg.mes.match(rx);matches=m?[m]:[];}
    if(!matches.length)return;
    addLog('matched '+matches.length);
    var isIF=(s.tagFormat==='image');

    setTimeout(async function(){
        try{
            toastr.info('gen '+matches.length+'...');
            if(!msg.extra)msg.extra={};
            if(!Array.isArray(msg.extra.image_swipes))msg.extra.image_swipes=[];
            if(msg.extra.image&&msg.extra.image_swipes.indexOf(msg.extra.image)===-1)msg.extra.image_swipes.push(msg.extra.image);
            var mel=$('.mes[mesid="'+mesIdx+'"]');
            var ok=0;
            for(var i=0;i<matches.length;i++){
                var match=matches[i],rawP=(typeof match[1]==='string')?match[1]:'';
                if(!rawP.trim())continue;
                var imgP=isIF?parseIC(rawP):rawP;
                if(!imgP.trim())continue;
                addLog('#'+(i+1)+':'+imgP.substring(0,80));
                try{
                    var pgKey=imgP.trim();var result;
                    if(_savedPG[pgKey]&&_savedPG[pgKey].promise){
                        addLog('\u26a1using pre-gen for: '+pgKey.substring(0,40));
                        result=await _savedPG[pgKey].promise;
                    }else{
                        result=await genImg(imgP);
                    }
                    if(!result)continue;
                    if(s.insertType===IT.INLINE){
                        msg.extra.image_swipes.push(result);msg.extra.image=result;msg.extra.title=imgP;msg.extra.inline_image=true;
                        appendMediaToMessage(msg,mel);await ctx.saveChat();ok++;
                    }else if(s.insertType===IT.REPLACE){
                        var tag=(typeof match[0]==='string')?match[0]:'';if(!tag)continue;
                        var hist=getH(mesIdx,i);hist.imgs.push(result);hist.prms.push(imgP);hist.idx=hist.imgs.length-1;saveHistory(mesIdx,i,hist);
                        var simpleImg='<img class="grok-gen-img" src="'+result+'" data-grok-prompt="'+esc(imgP)+'" data-grok-mid="'+mesIdx+'" data-grok-pid="'+i+'">';
                        msg.mes=msg.mes.replace(tag,simpleImg);
                        updateMessageBlock(mesIdx,msg);setTimeout(wrapAll,300);setTimeout(wrapAll,800);
                        await eventSource.emit(event_types.MESSAGE_UPDATED,mesIdx);await ctx.saveChat();ok++;
                    }
                }catch(ie){
                    addLog('fail#'+(i+1)+':'+ie.message);
                    if(s.insertType===IT.REPLACE){
                        var ftag=(typeof match[0]==='string')?match[0]:'';
                        if(ftag){
                            var retrySpan='<span data-grok-retry="1" data-grok-mid="'+mesIdx+'" data-grok-pid="'+i+'" data-grok-prompt="'+esc(imgP)+'" style="display:block;padding:12px;margin:8px 0;background:rgba(255,80,80,0.08);border:1px dashed rgba(255,80,80,0.3);border-radius:10px;cursor:pointer;color:#ccc;font-size:13px;text-align:center;">\u21bb fail - tap retry | '+imgP.substring(0,50)+'</span>';
                            msg.mes=msg.mes.replace(ftag,retrySpan);
                            updateMessageBlock(mesIdx,msg);await ctx.saveChat();
                        }
                    }toastr.warning('fail#'+(i+1));
                }
            }
            addLog(ok+' done');if(ok>0){toastr.success(ok+' done');setTimeout(wrapAll,500);setTimeout(wrapAll,1500);}
        }catch(e){toastr.error('err:'+e.message);}
    },0);
}

//==================== Stream Pre-generation ====================
var _streamBuf='';
var _preGens={};
var _preGenActive=false;
var _streamLastLen=0;

function _resetPreGen(){
    var keys=Object.keys(_preGens);
    if(keys.length>0)addLog('pre-gen reset, had '+keys.length+' entries');
    _streamBuf='';_preGens={};_preGenActive=false;_streamLastLen=0;
}

eventSource.on(event_types.STREAM_TOKEN_RECEIVED,function(data){
    var s=extension_settings[EXT];
    if(!s||s.insertType===IT.DISABLED||s.streamPregen===false)return;
    _preGenActive=true;
    var tok=(typeof data==='string')?data:(data&&data.token?data.token:'');
    if(!tok)return;
    _streamBuf=(tok.length>_streamBuf.length+50)?tok:(_streamBuf+tok);if(_streamBuf.length-_streamLastLen<40)return;_streamLastLen=_streamBuf.length;
    var rxStr=s.promptInjection.regex;if(!rxStr)return;
    var rx;try{rx=regexFromString(rxStr);}catch(e){return;}
    var isIF=(s.tagFormat==='image');
    var matches;
    if(rx.global){matches=Array.from(_streamBuf.matchAll(rx));}
    else{var m=_streamBuf.match(rx);matches=m?[m]:[];}
    if(!matches.length)return;
    for(var i=0;i<matches.length;i++){
        var match=matches[i];
        var rawP=(typeof match[1]==='string')?match[1]:'';
        if(!rawP.trim())continue;
        var imgP=isIF?parseIC(rawP):rawP;
        if(!imgP.trim())continue;
        var key=imgP.trim();
        if(_preGens[key])continue;
        addLog('\u26a1stream pre-gen #'+(i+1)+': '+key.substring(0,60));
        (function(k){
            var prom=genImg(k);
            _preGens[k]={promise:prom,done:false,result:null};
            prom.then(function(r){
                _preGens[k].done=true;_preGens[k].result=r;
                addLog('\u26a1pre-gen done: '+k.substring(0,40));
            }).catch(function(e){
                _preGens[k].done=true;_preGens[k].result=null;
                addLog('\u26a1pre-gen fail: '+e.message);
            });
        })(key);
    }
});

eventSource.on(event_types.GENERATION_STOPPED,function(){_resetPreGen();});
eventSource.on(event_types.CHAT_CHANGED,function(){_resetPreGen();setTimeout(function(){wrapAll();startObs();},500);});
