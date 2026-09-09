const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const Renderer = require('react-test-renderer');
const root = path.resolve(__dirname,'..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function harness(defaults = {}, modules = []) {
    const {createRuntime} = await import('../src/runtime.js');
    const commands = new Map(), events = new Map(), sheets = new Map(), hooks = new Map(), toasts = [], calls = [];
    const control = new AbortController();
    const patcher = {};
    for (const kind of ['before','after','instead']) patcher[kind] = (key, parent, cb) => { const old=parent[key]; const wrap=function(...args) { if(kind==='before') { cb(args); return old.apply(this,args); } if(kind==='instead') return cb(args,(...next)=>old.apply(this,next)); const out=old.apply(this,args); return cb(args,out) ?? out; }; parent[key]=wrap; return ()=>{if(parent[key]===wrap)parent[key]=old;}; };
    const store={...defaults};
    const RN={View:'View',Text:'Text',Image:'Image',ScrollView:'ScrollView',TextInput:'RNInput',Pressable:'Pressable',ActivityIndicator:'Spinner',Platform:{OS:'ios'},NativeModules:{},Linking:{openURL:async u=>calls.push(u),canOpenURL:async()=>false}};
    const D={Text:'Text',Button:'Button',TextInput:'Input',ActionSheet:'ActionSheet',TableSwitchRow:'Switch',TableRowGroup:'Group',AlertModal:'Alert',AlertActions:'Actions',AlertActionButton:'AlertButton'};
    const C={...D,SettingsPage:'SettingsPage',RowIcon:'RowIcon'};
    const common={React,ReactNative:RN,components:D,clipboard:{setString:s=>calls.push(s)},FluxDispatcher:{dispatch:e=>{for(const fn of events.get(e.type)||[])fn(e);}},url:{openURL:u=>calls.push(u)}};
    const metro={common,findByProps:(...props)=>modules.find(m=>props.every(p=>p in m)),findByName:name=>modules.find(m=>m.name===name),findByDisplayName:name=>modules.find(m=>m.displayName===name),findByStoreName:name=>modules.find(m=>m.storeName===name)};
    const commandApi={registerCommand:c=>{assert(!commands.has(c.name));commands.set(c.name,c);return()=>commands.delete(c.name);}};
    const flux={subscribe:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);return()=>events.get(name).delete(fn);}};
    const ui={components:C,showToast:m=>toasts.push(m),openAlert:(key,e)=>sheets.set(key,e),dismissAlert:key=>sheets.delete(key),sheets:{showSheet:(key,Component)=>sheets.set(key,Component),hideSheet:key=>sheets.delete(key)}};
    const B={React,ReactNative:RN,metro,commands:commandApi,patcher,flux,plugin:{id:'test',createStorage:initial=>{for(const [k,v] of Object.entries(initial||{})) if(store[k]===undefined) store[k]=v; return store;},flushStorage:async()=>{},useProxy:()=>store},ui,api:{commands:commandApi,patcher,flux,ui,react:{jsx:{onJsxCreate:(name,fn)=>hooks.set(name,fn),deleteJsxCreate:(name,fn)=>{if(hooks.get(name)===fn)hooks.delete(name);}}}}};
    const r=createRuntime(B,{id:'test',name:'Test',version:'2.1.0',authors:[]},defaults);
    return {r,commands,events,sheets,hooks,toasts,calls,control,api:B,common,B};
}
test('all Bunny spec-3 artifacts export definePlugin and match the hosted manifest', async()=>{
    const registry=JSON.parse(fs.readFileSync(path.join(root,'src/registry.json')));
    assert.equal(registry.length,18);
    for(const meta of registry){
        const manifest=JSON.parse(fs.readFileSync(path.join(root,meta.folder,'manifest.json')));
        const bytes=fs.readFileSync(path.join(root,meta.folder,manifest.main));
        const src=bytes.toString();
        assert.equal(manifest.spec,3,meta.folder);
        assert.equal(manifest.type,'plugin');
        assert.equal(manifest.main,'index.js');
        assert.equal(manifest.id,meta.id);
        assert.equal(manifest.version,meta.version);
        assert.equal(manifest.display.name,meta.name);
        assert(manifest.display.authors.some(a=>a.id==='957164619061932045'));
        assert.equal(manifest.extras.license,meta.license);
        assert.equal(manifest.extras.source,meta.source);
        assert.deepEqual(manifest.extras.bunny,{});
        assert.equal(manifest.schemaVersion,undefined);
        assert.equal(manifest.bundle,undefined);
        assert(bytes.length<=1048576);
        assert(!src.includes('__snowRegisterPlugin'),meta.folder);
        assert(!src.includes('globalThis.bunny'),meta.folder);
        assert(src.includes('definePlugin'),meta.folder);
        let plugin;
        vm.runInNewContext(src,{bunny:{},definePlugin:d=>{plugin=d;return d;},console,URL,AbortController,setTimeout,clearTimeout},{timeout:2000});
        assert.equal(typeof plugin.start,'function',meta.folder);
        assert.equal(typeof plugin.stop,'function',meta.folder);
        assert.equal(typeof plugin.SettingsComponent,'function',meta.folder);
    }
});
test('runtime deadlines reject hanging fetch and abort on dispose',async()=>{
    const {r}=await harness(); const old=global.fetch; global.fetch=()=>new Promise(()=>{});
    try { await assert.rejects(r.request('https://example.com',{},10),/timed out/); const promise=r.request('https://example.com',{},1000); r.dispose(); await assert.rejects(promise,/stopped/); } finally {global.fetch=old;await r.dispose();}
});
test('GifRoulette registers once, sends once by return, and handles empty favorites',async()=>{
    const {default:factory,gifUrls}=await import('../src/plugins/gif-roulette.js');
    assert.deepEqual(gifUrls({favoriteGifs:{gifs:{'https://tenor.com/view/a':{src:'https://media/a.gif'}}}}),['https://tenor.com/view/a']);
    const {r,commands,toasts}=await harness({},[{getFavoriteGIFs:()=>['https://media/a.gif']}]); const plugin=factory(r);plugin.start();
    assert.equal(commands.size,1); assert.equal(commands.get('gifroulette').id,undefined);
    assert.deepEqual(await commands.get('gifroulette').execute([]),{content:'https://media/a.gif'});await r.dispose();assert.equal(commands.size,0);
    const empty=await harness(); factory(empty.r).start(); assert.equal(await empty.commands.get('gifroulette').execute([]),undefined);assert.equal(empty.toasts.length,1);await empty.r.dispose();
});
test('ReplyToStatus has one button across nested and sibling profile hooks; unmount releases ownership',async()=>{
    const {default:factory,normalizeStatus,statusParts}=await import('../src/plugins/reply-to-status.js');
    const {r,sheets}=await harness({},[{storeName:'UserStore',getCurrentUser:()=>({id:'self'})}]);const p=factory(r),status={text:'Hello <:wave:123456789012345678> <123456789012345679>'};
    assert.equal(normalizeStatus([{type:4,state:'hey',emoji:{name:'🔥'}}]).emojiName,'🔥');assert.equal(statusParts(status).filter(p=>p.id).length,2);
    let tree;
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement('View',null,
        React.createElement(p.ProfileGate,{userId:'other',status},React.createElement(p.ProfileGate,{userId:'other',status},React.createElement('Profile'))),
        React.createElement(p.ProfileGate,{userId:'other',status},React.createElement('Header'))));});
    const buttons=()=>tree.root.findAllByType('Button').filter(b=>b.props.text==='Reply to Status');assert.equal(buttons().length,1);
    await Renderer.act(async()=>buttons()[0].props.onPress()); assert.equal(sheets.size,1);
    await Renderer.act(async()=>tree.unmount()); p.stop(); await r.dispose(); assert.equal(sheets.size,0);
});
test('ReplyToStatus sheet cleanup permits reopening and sends one quoted DM with no mentions',async()=>{
    const {default:factory}=await import('../src/plugins/reply-to-status.js'); const {r}=await harness();const p=factory(r),requests=[];r.discord=async(url,opts)=>{requests.push([url,JSON.parse(opts.body)]);return{json:()=>({id:'dm'})};};let tree,closed=0;
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(p.Composer,{userId:'other',status:{text:'hey',emojiName:'🔥'},close:()=>closed++}));});
    const button=tree.root.findAllByType('Button').find(b=>b.props.text==='👍'); await Renderer.act(async()=>{button.props.onPress();button.props.onPress();await tick();});
    assert.equal(requests.length,2);assert.equal(closed,1);assert.deepEqual(requests[1][1].allowed_mentions,{parse:[]});assert.match(requests[1][1].content,/🔥 hey/);await Renderer.act(async()=>tree.unmount());await r.dispose();
});
test('DebugConsole formats circular data, groups repeats, redacts credentials, caps and clears',async()=>{
    const {default:factory,redact}=await import('../src/plugins/debug-console.js'); const {r}=await harness();const p=factory(r),obj={};obj.self=obj;p.capture('warn',[obj]);assert.match(p.dump(),/Circular/);p.capture('warn',[obj]);assert.equal(p.getEntries()[0].count,2);
    assert.match(redact('Authorization: Bearer fake-secret'),/redacted/);for(let n=0;n<500;n++)p.capture('log',[n]);assert.equal(p.getEntries().length,400);p.clear();assert.equal(p.getEntries().length,0);p.stop();await r.dispose();
});
test('NitroSniper deduplicates events and continues after failure without redeeming real gifts',async()=>{
    const {default:factory,giftCodes,webhookUrl}=await import('../src/plugins/nitro-sniper.js');
    assert.equal(giftCodes('discord.gift/1234567890abcdef discord.gift/1234567890abcdef').length,1);assert.throws(()=>webhookUrl('https://example.com/hook'));
    const {r,events}=await harness(factory.defaults);const p=factory(r);let attempts=0;r.discord=async()=>{attempts++;throw new Error('mock failure');};p.start();assert.equal(events.get('MESSAGE_CREATE').size,1);
    const event={message:{id:'123',timestamp:new Date(Date.now()+1000).toISOString(),content:'discord.gift/1234567890abcdef',author:{id:'other'},channel_id:'channel'}};
    p.receive(event);p.receive(event);await tick();assert.equal(attempts,1);assert.equal(p.stats.failed,1);p.receive({message:{...event.message,content:'discord.gift/abcdefghijklmnop'}});await tick();assert.equal(attempts,2);p.stop();await r.dispose();assert.equal(events.get('MESSAGE_CREATE').size,0);
});
test('NitroSniper ignores historical messages and skips pending work after stop',async()=>{
    const {default:factory}=await import('../src/plugins/nitro-sniper.js');const {r}=await harness(factory.defaults);const p=factory(r);let attempts=0,finish;r.discord=()=>{attempts++;return new Promise(resolve=>finish=resolve);};p.start();
    p.receive({message:{id:'123',timestamp:'2020-01-01',content:'discord.gift/1234567890abcdef'}});assert.equal(attempts,0);
    p.receive({message:{id:'123',timestamp:new Date(Date.now()+1000).toISOString(),content:'discord.gift/1234567890abcdef discord.gift/abcdefghijklmnop'}});p.stop();finish({});await tick();assert.equal(attempts,1);assert.equal(p.stats.claimed,0);await r.dispose();
});
test('Spotify URL normalization and external app mappings reject lookalike hosts',async()=>{
    const {spotifyLink}=await import('../src/plugins/spotify-preview.js');const {appLink,shouldPing}=await import('../src/plugins/mobile-ports.js');assert.equal(spotifyLink('https://open.spotify.com/intl-de/track/abc?si=x').embed,'https://open.spotify.com/embed/track/abc');assert.equal(spotifyLink('https://open.spotify.com.evil.test/track/abc'),null);assert.equal(appLink('https://open.spotify.com/track/abc'),'spotify:track:abc');assert.equal(appLink('https://music.apple.com/us/album/test/1'),'musics://music.apple.com/us/album/test/1');
    assert.equal(shouldPing({id:'second',author:{id:'other'}},{type:1},'first',{},'self'),false);assert.equal(shouldPing({id:'first',author:{id:'other'}},{type:1},'first',{},'self'),true);assert.equal(shouldPing({id:'second',mentions:[{id:'self'}]},{type:1},'first',{allowMentions:true},'self'),true);
});
test('shared URL handlers preserve fallback and independent unload order',async()=>{
    const {addUrlHandler}=await import('../src/url-hub.js');const a=await harness(),b=await harness();b.r.common.url=a.r.common.url;let hits=[];addUrlHandler(a.r,10,()=>{hits.push('low');return false;});addUrlHandler(b.r,100,()=>{hits.push('high');return false;});a.common.url.openURL('https://example.com');assert.deepEqual(hits,['high','low']);assert.deepEqual(a.calls,['https://example.com']);await a.r.dispose();hits=[];b.r.common.url.openURL('https://example.com/2');assert.deepEqual(hits,['high']);await b.r.dispose();
});
test('PreviewFile rejects big/binary/foreign content and preserves signed CDN URL',async()=>{
    const {default:factory,attachmentUrl,previewable}=await import('../src/plugins/preview-file.js');assert.equal(previewable({filename:'a.txt',size:999999}),false);assert.throws(()=>attachmentUrl('https://example.com/attachments/a'));const url='https://cdn.discordapp.com/attachments/1/2/a.txt?ex=123&hm=signature';assert.equal(attachmentUrl(url),url);
    const {r,commands,sheets}=await harness();const p=factory(r);r.request=async()=>({text:'a\u0000b',response:{headers:{get:()=>null}}});await assert.rejects(p.load({url,filename:'a.txt',size:3}),/Binary/);
    r.request=async()=>({text:'hello file',response:{headers:{get:()=>null}}});p.start();assert.equal(await commands.get('previewfile').execute([{name:'url',value:url}]),undefined);assert.equal(sheets.size,1);await r.dispose();
});
test('image conversion preserves PNG/APNG bytes and converts actual JPEG to PNG',async()=>{
    const {toPng,encodePng,encode64,decode64}=await import('../src/image-conversion.js');const UPNG=require('upng-js'),jpeg=require('jpeg-js');const rgba=Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
    const png=encodePng(rgba,2,2);assert.deepEqual(decode64(toPng(encode64(png)).uri),png);assert.deepEqual(new Uint8Array(UPNG.toRGBA8(UPNG.decode(png.buffer))[0]),rgba);
    const frame=new Uint8Array(16*16*4).fill(255);const apng=new Uint8Array(UPNG.encode([frame.buffer,Uint8Array.from(frame,x=>255-x).buffer],16,16,0,[100,100]));const animated=toPng(encode64(apng));assert.equal(animated.animated,true);assert.deepEqual(decode64(animated.uri),apng);
    const jpg=jpeg.encode({data:rgba,width:2,height:2},90).data;const converted=toPng(encode64(jpg));assert.equal(UPNG.decode(decode64(converted.uri).buffer).width,2);assert.throws(()=>toPng(encode64(Uint8Array.from([71,73,70,56]))),/Use PNG/);
});
test('HighlightCode transformations do not mutate input rows',async()=>{const {default:factory}=await import('../src/plugins/highlight-code.js');const {r}=await harness(factory.defaults);const p=factory(r),rows=[{message:{content:'```js\nconst a = 1;\n```'}}],before=JSON.stringify(rows);const output=p.transformRowsJson(rows);assert.equal(JSON.stringify(rows),before);assert.notEqual(JSON.stringify(output),before);await r.dispose();});
test('Decor follows Equicord multipart contract and caches only a confirmed creation',async()=>{
    const {default:factory}=await import('../src/plugins/decor.js');const {encode64,encodePng}=await import('../src/image-conversion.js');const {r}=await harness({tokens:{},token:'fake-decor-token'});const p=factory(r),oldXHR=global.XMLHttpRequest,oldForm=global.FormData;let sent,response={hash:'saved-hash',alt:'Test',animated:false};
    global.FormData=class{constructor(){this.fields=[];}append(...args){this.fields.push(args);}};
    global.XMLHttpRequest=class{open(method,url){this.method=method;this.url=url;}setRequestHeader(key,value){this.headers={...this.headers,[key]:value};}send(form){sent=this;this.form=form;this.status=200;this.responseText=JSON.stringify(response);queueMicrotask(()=>this.onload());}abort(){}};
    const asset={base64:encode64(encodePng(new Uint8Array([255,0,0,255]),1,1)),uri:'file:///test.png'};
    try { const result=await p.createDecorationUpload(asset,'Test');assert.equal(result.hash,'saved-hash');assert.equal(sent.method,'PUT');assert.equal(sent.url,'https://decor.fieryflames.dev/api/users/@me/decoration');assert.equal(sent.headers.Authorization,'Bearer fake-decor-token');assert.equal(sent.headers['Content-Type'],undefined);assert.deepEqual(sent.form.fields.map(f=>f[0]),['image','alt']);assert.match(sent.form.fields[0][1].uri,/^data:image\/png;base64,/);assert.equal(p.getCustomDecorations().length,1);response={};await assert.rejects(p.createDecorationUpload(asset,'Test'),/did not confirm/);assert.equal(p.getCustomDecorations().length,1); } finally {p.stop();await r.dispose();global.XMLHttpRequest=oldXHR;global.FormData=oldForm;}
});
test('Decor create UI recovers from upload failure and prevents duplicate submissions',async()=>{
    const {default:factory}=await import('../src/plugins/decor.js');const {encode64,encodePng}=await import('../src/image-conversion.js');const image={uri:'file:///test.png',base64:encode64(encodePng(new Uint8Array([255,0,0,255]),1,1))};const {r}=await harness({tokens:{},token:'fake'},[{launchImageLibrary:(_opts,cb)=>cb({assets:[image]})}]);const p=factory(r),oldXHR=global.XMLHttpRequest,oldForm=global.FormData;let xhr,sends=0,tree;
    global.FormData=class{append(){}};global.XMLHttpRequest=class{open(){}setRequestHeader(){}send(){sends++;xhr=this;}abort(){}};
    try { await Renderer.act(async()=>{tree=Renderer.create(React.createElement(p.CreateDecorationPage));});await Renderer.act(async()=>tree.root.findAllByType('Button').find(b=>b.props.text==='Choose image').props.onPress());await Renderer.act(async()=>tree.root.findByType('Input').props.onChange('Name'));const submit=tree.root.findAllByType('Button').find(b=>b.props.text==='Create decoration');await Renderer.act(async()=>{submit.props.onPress();submit.props.onPress();await tick();});assert.equal(sends,1);assert(tree.root.findAllByType('Button').some(b=>b.props.text==='Creating…'&&b.props.disabled));await Renderer.act(async()=>{xhr.status=503;xhr.onload();await tick();});assert(tree.root.findAllByType('Button').some(b=>b.props.text==='Create decoration'&&!b.props.disabled));assert.match(JSON.stringify(tree.toJSON()),/HTTP 503/); }finally{await Renderer.act(async()=>tree?.unmount());p.stop();await r.dispose();global.XMLHttpRequest=oldXHR;global.FormData=oldForm;}
});
test('Decor stop aborts an in-flight upload',async()=>{const {default:factory}=await import('../src/plugins/decor.js');const {encode64,encodePng}=await import('../src/image-conversion.js');const {r}=await harness({tokens:{},token:'fake'});const p=factory(r),oldXHR=global.XMLHttpRequest,oldForm=global.FormData;let aborted=false;global.FormData=class{append(){}};global.XMLHttpRequest=class{open(){}setRequestHeader(){}send(){}abort(){aborted=true;}};try{const pending=p.createDecorationUpload({base64:encode64(encodePng(new Uint8Array([0,0,0,255]),1,1))},'Test');await tick();p.stop();await assert.rejects(pending,/cancelled|stopped/);assert(aborted);}finally{await r.dispose();global.XMLHttpRequest=oldXHR;global.FormData=oldForm;}});
test('invite commands do nothing before confirmation and preserve server features on pause/resume',async()=>{
    const {PauseInvitesForever}=await import('../src/plugins/mobile-ports.js');const {r,commands,sheets}=await harness();const p=PauseInvitesForever(r);let requests=[];r.discord=async(url,opts)=>{requests.push({url,...opts});return{json:()=>({features:['COMMUNITY','INVITES_DISABLED','NEWS']})};};p.start();await commands.get('pauseinvites').execute([],{channel:{guild_id:'123456789012345678'}});assert.equal(requests.length,0);assert.equal(sheets.size,1);
    for(const pause of [true,false]){requests=[];let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(p.Confirm,{guildId:'123456789012345678',pause,close:()=>{}}));});await Renderer.act(async()=>{const b=tree.root.findAllByType('Button').find(b=>b.props.text===(pause?'Pause invites':'Resume invites'));b.props.onPress();b.props.onPress();await tick();});assert.equal(requests.length,2);assert.equal(requests[1].method,'PATCH');assert.deepEqual(JSON.parse(requests[1].body).features,pause?['COMMUNITY','NEWS','INVITES_DISABLED']:['COMMUNITY','NEWS']);await Renderer.act(async()=>tree.unmount());}await r.dispose();
});
test('sheet render error shows a working Close button instead of trapping the UI',async()=>{const {r,sheets}=await harness();let tree;function Broken(){throw new Error('fixture failure');}const old=console.error;console.error=()=>{};try{r.open('broken',Broken);const Component=[...sheets.values()][0];await Renderer.act(async()=>{tree=Renderer.create(React.createElement(Component));});assert.match(JSON.stringify(tree.toJSON()),/Could not display/);await Renderer.act(async()=>tree.root.findAllByType('Button').find(b=>b.props.text==='Close').props.onPress());assert.equal(sheets.size,0);}finally{console.error=old;await Renderer.act(async()=>tree?.unmount());await r.dispose();}});
test('all 18 production bundles start, render settings and stop',async()=>{
    const registry=JSON.parse(fs.readFileSync(path.join(root,'src/registry.json')));
    for(const meta of registry){const fixture=await harness(),manifest=JSON.parse(fs.readFileSync(path.join(root,meta.folder,'manifest.json')));let definition,tree;
        const silent={log(){},info(){},warn(){},error(){},debug(){}};
        const sandbox={plugin:undefined,bunny:fixture.B,definePlugin:d=>d,console:silent,URL,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify([])})};
        vm.runInNewContext(fs.readFileSync(path.join(root,meta.folder,manifest.main),'utf8'),sandbox);
        definition=sandbox.plugin&&(sandbox.plugin.default||sandbox.plugin);
        try{await definition.start();await tick();await Renderer.act(async()=>{tree=Renderer.create(definition.SettingsComponent());});}
        finally{await Renderer.act(async()=>tree?.unmount());await definition.stop();await fixture.r.dispose();}
        assert.equal(fixture.commands.size,0,meta.folder);assert.equal(fixture.hooks.size,0,meta.folder);assert.equal(fixture.sheets.size,0,meta.folder);
    }
});
