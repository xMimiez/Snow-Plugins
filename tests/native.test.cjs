const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const Renderer = require('react-test-renderer');
const root = path.resolve(__dirname,'..');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('Discord requests use the existing HTTP client, preserve rate limits, and never read credentials', async()=>{
    let request, failure, complete;
    const http={get:async value=>{request=value;return {status:200,body:{id:'example'}};},post:async value=>{request=value;if(failure)throw failure;return new Promise(resolve=>{complete=resolve;});},put(){},del(){}};
    const {r}=await harness({},[http,{getToken(){throw new Error('Must not read token');}}]);
    assert.deepEqual((await r.discord('/users/example')).json(),{id:'example'});
    assert.deepEqual(request,{url:'/users/example'});
    failure={status:429,body:{message:'Rate limited',retry_after:3}};
    await assert.rejects(r.discord('/test',{method:'POST',body:'{"a":1}'}),e=>e.status===429&&e.retryAfter===3);
    assert.deepEqual(request,{url:'/test',body:{a:1}});
    failure=null; const pending=r.discord('/test',{method:'POST'}); await r.dispose(); complete({status:200,body:{}});
    await assert.rejects(pending,/stopped/);
    await assert.rejects(r.discord('//other.example'),/Invalid/);
});
async function harness(defaults = {}, modules = []) {
    const {createRuntime} = await import('../src/runtime.js');
    const commands = new Map(), events = new Map(), sheets = new Map(), hooks = new Map(), toasts = [], calls = [];
    const control = new AbortController();
    const patcher = {};
    for (const kind of ['before','after','instead']) patcher[kind] = (key, parent, cb) => { const old=parent[key]; const wrap=function(...args) { if(kind==='before') { cb(args); return old.apply(this,args); } if(kind==='instead') return cb(args,(...next)=>old.apply(this,next)); const out=old.apply(this,args); return cb(args,out) ?? out; }; parent[key]=wrap; return ()=>{if(parent[key]===wrap)parent[key]=old;}; };
    const store={...defaults};
    const RN={View:'View',Text:'Text',Image:'Image',ScrollView:'ScrollView',TextInput:'RNInput',Pressable:'Pressable',Switch:'Switch',Modal:'Modal',ActivityIndicator:'Spinner',Platform:{OS:'ios'},NativeModules:{},Linking:{openURL:async u=>calls.push(u),canOpenURL:async()=>false}};
    const D={Text:'Text',Button:'Button',TextInput:'Input',ActionSheet:'ActionSheet',TableSwitchRow:'Switch',TableRowGroup:'Group',AlertModal:'Alert',AlertActions:'Actions',AlertActionButton:'AlertButton'};
    const C={...D,SettingsPage:'SettingsPage',RowIcon:'RowIcon'};
    const common={React,ReactNative:RN,components:D,clipboard:{setString:s=>calls.push(s)},FluxDispatcher:{dispatch:e=>{for(const fn of events.get(e.type)||[])fn(e);}},url:{openURL:u=>calls.push(u)}};
    const metro={common,findByProps:(...props)=>modules.find(m=>props.every(p=>p in m)),findByName:name=>modules.find(m=>m.name===name),findByDisplayName:name=>modules.find(m=>m.displayName===name),findByStoreName:name=>modules.find(m=>m.storeName===name)};
    let commandId = -1;
    const commandApi={registerCommand:c=>{assert(!commands.has(c.name));c.id=String(--commandId);commands.set(c.name,c);return()=>commands.delete(c.name);}};
    const flux={subscribe:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);return()=>events.get(name).delete(fn);}};
    const ui={components:C,showToast:m=>toasts.push(m),openAlert:(key,e)=>sheets.set(key,e),dismissAlert:key=>sheets.delete(key),sheets:{showSheet:(key,Component)=>sheets.set(key,Component),hideSheet:key=>sheets.delete(key)}};
    const B={React,ReactNative:RN,metro,commands:commandApi,patcher,flux,plugin:{id:'test',createStorage:initial=>{for(const [k,v] of Object.entries(initial||{})) if(store[k]===undefined) store[k]=v; return store;},flushStorage:async()=>{},useProxy:()=>store},ui,api:{commands:commandApi,patcher,flux,ui,react:{jsx:{onJsxCreate:(name,fn)=>hooks.set(name,fn),deleteJsxCreate:(name,fn)=>{if(hooks.get(name)===fn)hooks.delete(name);}}}}};
    const r=createRuntime(B,{id:'test',name:'Test',version:'2.1.0',authors:[]},defaults);
    return {r,commands,events,sheets,hooks,toasts,calls,control,api:B,common,B};
}
test('NightyTab bundle opens iOS http addresses through the cleartext loader',()=>{
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'NightyTab/manifest.json'),'utf8'));
    const src=fs.readFileSync(path.join(root,'NightyTab/index.js'),'utf8');
    assert.equal(manifest.version,'2.0.8');
    assert.match(src,/"version": "2\.0\.8"/);
    assert.doesNotMatch(src,/Open in Safari/);
    assert.match(src,/function loadCleartextPage/);
    assert.match(src,/function isHttpPage/);
    assert.match(src,/NIGHTY_HTTP/);
    assert.match(src,/baseUrl: "http:\/\/localhost\/"/);
    assert.match(src,/isHttpPage\(src\)/);
});

test('NightyTab bundle adds one aligned button to a You bar built by a factory loaded before the plugin',async()=>{
    const jsxHooks=new Map();
    const {api}=await harness({showNightyButton:true,url:'https://example.com'});
    api.api={react:{jsx:{onJsxCreate:(name,callback)=>jsxHooks.set(name,callback),deleteJsxCreate:name=>jsxHooks.delete(name)}}};
    // Discord modules keep the factory they loaded with, so this one never sees the plugin's patches.
    const create=React.createElement;
    const context=vm.createContext({bunny:api,definePlugin:x=>x,console,URL,AbortController,setTimeout,clearTimeout});
    vm.runInContext(fs.readFileSync(path.join(root,'NightyTab/index.js'),'utf8')+'\n;globalThis.result=plugin;',context);
    const plugin=context.result.default;
    await plugin.start();
    try{
        const Glyph=()=>create('View',{style:{width:24,height:24}});
        const NavIcon=({IconComponent,accessibilityLabel,onPress,testID})=>create('Pressable',{accessibilityLabel,onPress,testID},create(IconComponent),create('Text',null,accessibilityLabel));
        function YouScreenNavIconMeasurer({children}){return create('View',null,children);}
        const icon=label=>create(NavIcon,{key:label,IconComponent:Glyph,accessibilityLabel:label,onPress(){}});
        const bar=key=>{
            const element=create(YouScreenNavIconMeasurer,{key},[icon('Quests'),icon('Nitro'),icon('Settings')]);
            return jsxHooks.get('YouScreenNavIconMeasurer')(YouScreenNavIconMeasurer,element)||element;
        };
        const buttons=node=>!node||typeof node!=='object'?[]:(node.props?.testID==='mime-nighty-profile-button'?[node]:[]).concat(...(node.children||[]).map(buttons));
        // Discord 354 can mount the row twice; only the first copy shows the button.
        let tree;await Renderer.act(async()=>{tree=Renderer.create(create('View',null,bar('first'),bar('second')));});
        const [first,second]=tree.toJSON().children;
        assert.equal(buttons(tree.toJSON()).length,1);
        assert.deepEqual(first.children.map(child=>child.props.accessibilityLabel),['Quests','Nitro','Settings','Nighty']);
        assert.equal(buttons(second).length,0);
        const box=first.children[3].children[0];
        assert.equal(box.props.style.width,24);
        assert.equal(box.props.style.height,24);
        assert.equal(first.children[3].children[1].children[0],'Nighty');
        // When the first copy unmounts, the remaining one takes the button over.
        await Renderer.act(async()=>{tree.update(create('View',null,bar('second')));});
        assert.equal(buttons(tree.toJSON()).length,1);
        await Renderer.act(async()=>tree.unmount());
    }finally{await plugin.stop();}
});

test('all Bunny spec-3 artifacts export definePlugin and match the hosted manifest', async()=>{
    const registry=JSON.parse(fs.readFileSync(path.join(root,'src/registry.json')));
    assert.equal(registry.length,24);
    for(const meta of registry){
        const manifest=JSON.parse(fs.readFileSync(path.join(root,meta.folder,'manifest.json')));
        const bytes=fs.readFileSync(path.join(root,meta.folder,manifest.main));
        const src=bytes.toString();
        assert.equal(manifest.spec,3,meta.folder);
        assert.equal(manifest.type,'plugin');
        assert.equal(manifest.main,'index.js');
        assert.equal(manifest.id,meta.id);
        if (meta.folder === 'NightyTab') assert.equal(manifest.version,'2.0.8');
        else assert.equal(manifest.version,meta.version);
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
    assert.equal(commands.size,1); assert.equal(typeof commands.get('gifroulette').id,'string');
    assert.deepEqual(await commands.get('gifroulette').execute([]),{content:'https://media/a.gif'});await r.dispose();assert.equal(commands.size,0);
    const empty=await harness(); factory(empty.r).start(); assert.equal(await empty.commands.get('gifroulette').execute([]),undefined);assert.equal(empty.toasts.length,1);await empty.r.dispose();
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
test('external app mappings reject lookalike hosts',async()=>{
    const {appLink,shouldPing}=await import('../src/plugins/mobile-ports.js');assert.equal(appLink('https://open.spotify.com/track/abc'),'spotify:track:abc');assert.equal(appLink('https://music.apple.com/us/album/test/1'),'musics://music.apple.com/us/album/test/1');
    assert.equal(shouldPing({id:'second',author:{id:'other'}},{type:1},'first',{},'self'),false);assert.equal(shouldPing({id:'first',author:{id:'other'}},{type:1},'first',{},'self'),true);assert.equal(shouldPing({id:'second',mentions:[{id:'self'}]},{type:1},'first',{allowMentions:true},'self'),true);
});
test('shared URL handlers preserve fallback and independent unload order',async()=>{
    const {addUrlHandler}=await import('../src/url-hub.js');const a=await harness(),b=await harness();b.r.common.url=a.r.common.url;let hits=[];addUrlHandler(a.r,10,()=>{hits.push('low');return false;});addUrlHandler(b.r,100,()=>{hits.push('high');return false;});a.common.url.openURL('https://example.com');assert.deepEqual(hits,['high','low']);assert.deepEqual(a.calls,['https://example.com']);await a.r.dispose();hits=[];b.r.common.url.openURL('https://example.com/2');assert.deepEqual(hits,['high']);await b.r.dispose();
});
test('PreviewFile rejects big/binary/foreign content and preserves signed CDN URL',async()=>{
    const {default:factory,attachmentUrl,previewable}=await import('../src/plugins/preview-file.js');assert.equal(previewable({filename:'a.txt',size:999999}),false);assert.throws(()=>attachmentUrl('https://example.com/attachments/a'));const url='https://cdn.discordapp.com/attachments/1/2/a.txt?ex=123&hm=signature';assert.equal(attachmentUrl(url),url);
    const {r,commands,sheets}=await harness();const p=factory(r);r.request=async()=>({text:'a\u0000b',response:{headers:{get:()=>null}}});await assert.rejects(p.load({url,filename:'a.txt',size:3}),/Binary/);
    r.request=async()=>({text:'hello file',response:{headers:{get:()=>null}}});p.start();assert.equal(commands.has('previewfile'),false);assert.equal(sheets.size,0);await r.dispose();
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
    const labeled=label=>tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel===label);
    try { await Renderer.act(async()=>{tree=Renderer.create(React.createElement(p.CreateDecorationPage));});await Renderer.act(async()=>labeled('Choose image').props.onPress());await Renderer.act(async()=>tree.root.findByType('RNInput').props.onChangeText('Name'));const submit=labeled('Create decoration');await Renderer.act(async()=>{submit.props.onPress();submit.props.onPress();await tick();});assert.equal(sends,1);assert(tree.root.findAllByType('Pressable').some(b=>b.props.accessibilityLabel==='Creating…'&&b.props.disabled));await Renderer.act(async()=>{xhr.status=503;xhr.onload();await tick();});assert(tree.root.findAllByType('Pressable').some(b=>b.props.accessibilityLabel==='Create decoration'&&!b.props.disabled));assert.match(JSON.stringify(tree.toJSON()),/HTTP 503/); }finally{await Renderer.act(async()=>tree?.unmount());p.stop();await r.dispose();global.XMLHttpRequest=oldXHR;global.FormData=oldForm;}
});
test('Decor stop aborts an in-flight upload',async()=>{const {default:factory}=await import('../src/plugins/decor.js');const {encode64,encodePng}=await import('../src/image-conversion.js');const {r}=await harness({tokens:{},token:'fake'});const p=factory(r),oldXHR=global.XMLHttpRequest,oldForm=global.FormData;let aborted=false;global.FormData=class{append(){}};global.XMLHttpRequest=class{open(){}setRequestHeader(){}send(){}abort(){aborted=true;}};try{const pending=p.createDecorationUpload({base64:encode64(encodePng(new Uint8Array([0,0,0,255]),1,1))},'Test');await tick();p.stop();await assert.rejects(pending,/cancelled|stopped/);assert(aborted);}finally{await r.dispose();global.XMLHttpRequest=oldXHR;global.FormData=oldForm;}});
test('HideQuestPopup presses Hide This for the You bar quest and leaves Quest Home', async () => {
    const { default: factory, isQuestPopup, isMobileDockKey, blocksDockDelivery, isDismissFunction, findDismissFunction, questDismissedFromBar, collectDockQuestIds, dismissDockQuest } = await import('../src/plugins/hide-quest-popup.js');
    assert.equal(isQuestPopup(function QuestBar() {}, {}), true);
    assert.equal(isQuestPopup(function QuestHome() {}, { questContent: 12 }), false);
    assert.equal(isQuestPopup(function Card() {}, { questContent: 13 }), true);
    assert.equal(isQuestPopup(function Card() {}, { questContent: 'QUEST_BAR_MOBILE' }), true);
    assert.equal(isQuestPopup(function Card() {}, { placement: 'MOBILE_HOME_DOCK_AREA' }), true);
    assert.equal(isQuestPopup(function Card() {}, { placement: 2, questId: '1' }), true);
    assert.equal(isQuestPopup(function Card() {}, { placement: 2 }), false);
    assert.equal(isQuestPopup(function Icon() {}, { accessibilityLabel: 'Quests' }), false);
    function QuestDockContextMenuActionSheet() {}
    assert.equal(isQuestPopup(QuestDockContextMenuActionSheet, { questContent: 13 }), false);
    assert.equal(isMobileDockKey('MOBILE_HOME_DOCK_AREA'), true);
    assert.equal(isMobileDockKey(1), false);
    assert.equal(blocksDockDelivery('function C(e){return "getQuestDeliveryDataForPlacement"}', [2]), true);
    assert.equal(blocksDockDelivery('function C(e){return "getQuestDeliveryDataForPlacement"}', [1]), false);
    assert.equal(blocksDockDelivery('function S(e){return "MOBILE_HOME_DOCK_AREA"}', [13]), true);
    assert.equal(blocksDockDelivery('function unrelated(){}', [2]), false);
    const selector = 'function I(e,t,n){let r=t.get(n);if(null==r)return;let i=e.get(r.quest.id);return i}';
    assert.equal(blocksDockDelivery(selector, [new Map(), new Map(), 2]), true);
    assert.equal(blocksDockDelivery(selector, [new Map(), new Map(), 1]), false);
    const dockId = '123456789012345678';
    const enrolledId = '223456789012345678';
    const dismissedId = '323456789012345678';
    const expiredId = '423456789012345678';
    const now = Date.UTC(2026, 10, 13);
    const quests = new Map([
        [enrolledId, { id: enrolledId, userStatus: { enrolledAt: '2026-11-01', dismissedQuestContent: 0 } }],
        [dismissedId, { id: dismissedId, userStatus: { dismissedQuestContent: 2 } }],
        [expiredId, { id: expiredId, config: { expiresAt: '2020-01-01' }, userStatus: {} }],
    ]);
    assert.equal(questDismissedFromBar(quests.get(dismissedId)), true);
    assert.equal(questDismissedFromBar(quests.get(enrolledId)), false);
    const decisions = new Map([[2, { questId: dockId }], [1, { questId: 'desktop' }]]);
    const delivered = new Map([[2, { quest: { id: dockId } }], [1, { quest: { id: '999' } }]]);
    assert.deepEqual(collectDockQuestIds({ questAdDecisionByPlacement: decisions, questToDeliverForPlacement: delivered, quests }, now).sort(), [dockId, enrolledId].sort());
    const clientCalls = [];
    async function dismissQuest(questId, content) {
        clientCalls.push([questId, content]);
        // QUESTS_DISMISS_CONTENT_BEGIN QUESTS_DISMISS_CONTENT
    }
    assert.equal(isDismissFunction(dismissQuest), true);
    const notifications = {};
    Object.defineProperty(notifications, 'PushNotificationIOS', { enumerable: true, get() { throw new Error('`new NativeEventEmitter()` requires a non-null argument.'); } });
    let findCalls = 0;
    const metro = {
        modules: [notifications, { dismissQuest }],
        find() { findCalls++; throw new Error('`new NativeEventEmitter()` requires a non-null argument.'); },
    };
    assert.equal(findDismissFunction(metro), dismissQuest);
    assert.equal(findCalls, 0);
    assert.equal(await dismissDockQuest({ dismiss: dismissQuest, questId: dockId }), 'client');
    assert.deepEqual(clientCalls, [[dockId, 13]]);
    const httpCalls = [];
    const http = await dismissDockQuest({
        discord: async (path, options) => { httpCalls.push({ path, options }); return { json: () => ({ dismissedQuestContent: 2 }) }; },
        questId: enrolledId,
        publish: body => httpCalls.push(body),
    });
    assert.equal(http, 'http');
    assert.equal(httpCalls[0].path, `/quests/${enrolledId}/dismissible-content/13/dismiss`);
    assert.equal(httpCalls[0].options.method, 'POST');
    assert.deepEqual(httpCalls[1], { dismissedQuestContent: 2 });
    assert.equal(await dismissDockQuest({ discord: async () => { throw new Error('no'); }, questId: '12' }), false);
    const { r, events } = await harness({}, [{ questAdDecisionByPlacement: decisions, questToDeliverForPlacement: delivered, quests }]);
    r.metro.modules = [{ dismissQuest }];
    const requests = [];
    r.discord = async (path, options) => { requests.push({ path, options }); return { json: () => ({}) }; };
    factory(r).start();
    function QuestBar() { return null; }
    QuestBar.displayName = 'QuestBar';
    function You() { return null; }
    try {
        await tick();
        assert.equal(React.createElement(QuestBar, { questId: '1' }), false);
        assert.equal(React.createElement(QuestDockContextMenuActionSheet, { questContent: 13 }).type, QuestDockContextMenuActionSheet);
        assert.equal(React.createElement(function QuestHome() {}, { questContent: 12 }).type.name, 'QuestHome');
        assert.equal(React.createElement(function Icon() {}, { accessibilityLabel: 'Quests' }).type.name, 'Icon');
        const kept = React.createElement(You, null, React.createElement(function Label() {}, { accessibilityLabel: 'You' }));
        assert.equal(kept.type, You);
        assert.equal(decisions.get(2), undefined);
        assert.deepEqual(decisions.get(1), { questId: 'desktop' });
        function Dock() { return null; }
        function Tabs() { return null; }
        function Screen() { return null; }
        function List() { return null; }
        function Card() { return null; }
        const dock = React.createElement(Screen, null,
            React.createElement(Dock, { quest: { id: dockId, config: { expiresAt: '2099-01-01' } } }, 'Get Reward!'),
            React.createElement(Tabs, null, React.createElement(function YouTab() {}, { accessibilityLabel: 'You' })));
        assert.equal(dock.props.children.length, 1);
        assert.equal(dock.props.children[0].type, Tabs);
        const home = React.createElement(Screen, null,
            React.createElement(List, null,
                React.createElement(Card, { questContent: 12, quest: { id: enrolledId, config: {} } }, 'Get Reward!'),
                React.createElement(Card, { questContent: 12, quest: { id: '523456789012345678', config: {} } })),
            React.createElement(Tabs, null, React.createElement(function YouTab() {}, { accessibilityLabel: 'You' })));
        assert.equal(home.props.children.length, 2);
        assert.equal(home.props.children[0].type, List);
        assert.equal(requests.length, 0);
        assert.deepEqual([...new Set(clientCalls.map(call => call[0]))].sort(), [dockId, enrolledId].sort());
        assert.ok(clientCalls.every(call => call[1] === 13));
        const before = clientCalls.length;
        events.get('CONNECTION_OPEN').forEach(fn => fn({ type: 'CONNECTION_OPEN' }));
        await tick();
        const after = clientCalls.length;
        assert.ok(after > before && after <= before + 2);
        events.get('CONNECTION_OPEN').forEach(fn => fn({ type: 'CONNECTION_OPEN' }));
        await tick();
        events.get('CONNECTION_OPEN').forEach(fn => fn({ type: 'CONNECTION_OPEN' }));
        await tick();
        assert.equal(clientCalls.length, after);
        assert.ok(clientCalls.every(call => call[0] === dockId || call[0] === enrolledId));
    } finally {
        await r.dispose();
    }
    assert.equal(decisions.get(2).questId, dockId);
    assert.equal(React.createElement(QuestBar, { questId: '1' }).type, QuestBar);
});
test('invite commands do nothing before confirmation and preserve server features on pause/resume',async()=>{
    const {PauseInvitesForever}=await import('../src/plugins/mobile-ports.js');const {r,commands,sheets}=await harness();const p=PauseInvitesForever(r);let requests=[];r.discord=async(url,opts)=>{requests.push({url,...opts});return{json:()=>({features:['COMMUNITY','INVITES_DISABLED','NEWS']})};};p.start();await commands.get('pauseinvites').execute([],{channel:{guild_id:'123456789012345678'}});assert.equal(requests.length,0);assert.equal(sheets.size,1);
    for(const pause of [true,false]){requests=[];let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(p.Confirm,{guildId:'123456789012345678',pause,close:()=>{}}));});await Renderer.act(async()=>{const b=tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel===(pause?'Pause invites':'Resume invites'));b.props.onPress();b.props.onPress();await tick();});assert.equal(requests.length,2);assert.equal(requests[1].method,'PATCH');assert.deepEqual(JSON.parse(requests[1].body).features,pause?['COMMUNITY','NEWS','INVITES_DISABLED']:['COMMUNITY','NEWS']);await Renderer.act(async()=>tree.unmount());}await r.dispose();
});
test('sheet render error shows a working Close button instead of trapping the UI',async()=>{const {r,sheets}=await harness();let tree;function Broken(){throw new Error('fixture failure');}const old=console.error;console.error=()=>{};try{r.open('broken',Broken);const Component=[...sheets.values()][0];await Renderer.act(async()=>{tree=Renderer.create(React.createElement(Component));});assert.match(JSON.stringify(tree.toJSON()),/Could not display/);await Renderer.act(async()=>tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel==='Close').props.onPress());assert.equal(sheets.size,0);}finally{console.error=old;await Renderer.act(async()=>tree?.unmount());await r.dispose();}});
test('all production bundles start, render settings and stop',async()=>{
    const registry=JSON.parse(fs.readFileSync(path.join(root,'src/registry.json')));
    for(const meta of registry){const fixture=await harness(),manifest=JSON.parse(fs.readFileSync(path.join(root,meta.folder,'manifest.json')));let definition,tree;
        const silent={log(){},info(){},warn(){},error(){},debug(){}};
        const sandbox={plugin:undefined,bunny:fixture.B,definePlugin:d=>d,console:silent,URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify([])})};
        vm.runInNewContext(fs.readFileSync(path.join(root,meta.folder,manifest.main),'utf8'),sandbox);
        definition=sandbox.plugin&&(sandbox.plugin.default||sandbox.plugin);
        try{await definition.start();await tick();await Renderer.act(async()=>{tree=Renderer.create(definition.SettingsComponent());});}
        finally{await Renderer.act(async()=>tree?.unmount());await definition.stop();await fixture.r.dispose();}
        assert.equal(fixture.commands.size,0,meta.folder);assert.equal(fixture.hooks.size,0,meta.folder);assert.equal(fixture.sheets.size,0,meta.folder);
    }
});

test('SDK command return stays with loader; nested defaults and alerts are isolated', async()=>{
    const first=await harness({nested:{list:[]}}), second=await harness({nested:{list:[]}});
    first.r.store.nested.list.push('x'); assert.deepEqual(second.r.store.nested.list,[]);
    let sends=0; first.r.send=async()=>{sends++;return true;};
    first.r.command({name:'sdk-return',description:'Fixture',execute:()=>({content:'hello'})});
    assert.deepEqual(await first.commands.get('sdk-return').execute([],{channel:{id:'123456'}}),{content:'hello'});
    assert.equal(sends,0);
    first.r.api.ui.openAlert('fixture',React.createElement('Alert'));
    await first.r.dispose();assert.equal(first.sheets.size,0);await second.r.dispose();
});

test('Rain-compatible settings sections coexist, do not mutate callers, and unload in either order',async()=>{
    const {registerSection}=await import('../src/settings-section.js');
    for(const reverse of [false,true]) {
        const constants={SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}};
        const original=constants.SETTING_RENDERER_CONFIG, lists={createList:config=>config};
        const a=await harness({},[constants,lists]),b=await harness({},[constants,lists]);
        registerSection(a.r,{name:'Custom',items:[{key:'A',title:()=> 'A',onPress:()=>{}}]});
        registerSection(b.r,{name:'Custom',items:[{key:'B',title:()=> 'B',onPress:()=>{}}]});
        const input={sections:[{settings:['ACCOUNT']}]};
        assert.deepEqual(new Set(lists.createList(input).sections[0].settings),new Set(['A','B']));
        assert.equal(input.sections.length,1);assert(constants.SETTING_RENDERER_CONFIG.A);assert(constants.SETTING_RENDERER_CONFIG.B);
        await (reverse?b:a).r.dispose();assert.equal(lists.createList(input).sections[0].settings.length,1);
        await (reverse?a:b).r.dispose();assert.equal(constants.SETTING_RENDERER_CONFIG,original);
        assert.equal(lists.createList(input),input);
    }
});

test('settings do not invent a facade method when settings namespaces are empty',async()=>{
    const {registerSection}=await import('../src/settings-section.js');const {r}=await harness();let registered=0;
    r.B.ui.settings={};r.B.api.settings={};
    assert.equal(registerSection(r,{name:'Test',items:[]}),false);assert.equal(registered,0);await r.dispose();
});

test('Nighty cleartext loader inlines same-origin files and keeps other origins',async()=>{
    const {isHttpPage,loadCleartextPage,parseSetCookie,cookieHeader,rewriteSpecifiers}=await import('../src/plugins/nighty-http.js');
    assert.equal(isHttpPage('http://10.0.0.8:5123/'),true);
    assert.equal(isHttpPage('https://10.0.0.8:5123/'),false);
    assert.equal(isHttpPage('http://user:pass@10.0.0.8/'),false);
    assert.deepEqual(parseSetCookie('session=abc; HttpOnly; Path=/, access_token=zzz; Path=/'),[{name:'session',value:'abc'},{name:'access_token',value:'zzz'}]);
    assert.equal(cookieHeader({session:'abc',access_token:'zzz'}),'session=abc; access_token=zzz');
    assert.match(rewriteSpecifiers("import './chunk.js'",'http://10.0.0.8:5123/assets/index.js'),/http:\/\/10\.0\.0\.8:5123\/assets\/chunk\.js/);
    const files={
        'http://10.0.0.8:5123/': '<!doctype html><html><head><link rel="stylesheet" href="/app.css"><script type="module" src="/assets/index.js"></script><script src="https://cdn.example/lib.js"></script></head><body><div id="root"></div></body></html>',
        'http://10.0.0.8:5123/app.css': 'body{color:red}',
        'http://10.0.0.8:5123/assets/index.js': "import './chunk.js'; console.log(1)",
        'http://10.0.0.8:5123/assets/chunk.js': 'export const n = 1;',
    };
    const loaded=await loadCleartextPage('http://10.0.0.8:5123/',async url=>files[url]);
    assert.equal(loaded.files,3);
    assert.match(loaded.html,/body\{color:red\}/);
    assert.match(loaded.html,/NIGHTY_HTTP/);
    assert.match(loaded.html,/<script>\(\(\) =>/);
    assert.match(loaded.html,/<script type="module">/);
    assert.match(loaded.html,/http:\/\/10\.0\.0\.8:5123\/assets\/chunk\.js/);
    assert.doesNotMatch(loaded.html,/URL\.createObjectURL/);
    assert.match(loaded.html,/https:\/\/cdn\.example\/lib\.js/);
    assert.doesNotMatch(loaded.html,/src="\/app\.css"/);
    assert.doesNotMatch(loaded.html,/<script type="module" src="http:\/\/10\.0\.0\.8/);
    await assert.rejects(loadCleartextPage('http://10.0.0.8:5123/',async url=>files[url],{maxAssets:1}),/too many files/);
});

test('Nighty validates URLs, requires toggle plus prefix plus attachment, and sends a non-pinging reply once',async()=>{
    const {default:factory,pageUrl,canDownload}=await import('../src/plugins/nighty-tab.js');
    assert.equal(pageUrl('javascript:alert(1)'),null);assert.equal(pageUrl('https://user:pass@example.com'),null);
    assert.equal(pageUrl('https://example.com/path'),'https://example.com/path');
    const message={id:'123',channel_id:'456',attachments:[{id:'789'}]};
    for (const values of [{scriptUtils:false,nightyPrefix:'.'},{scriptUtils:true,nightyPrefix:''},{scriptUtils:true,nightyPrefix:' '},{scriptUtils:true,nightyPrefix:'ab'}]) assert.equal(canDownload(values,message),false);
    assert.equal(canDownload({scriptUtils:true,nightyPrefix:'.'},{...message,attachments:[]}),false);
    let sent=[],finish;
    const http={get(){},put(){},del(){},post:req=>{sent.push(req);return new Promise(resolve=>finish=resolve);}};
    const {r}=await harness({...factory.defaults,scriptUtils:true},[http]);
    const plugin=factory(r),pending=plugin.download(message);await plugin.download(message);assert.equal(sent.length,1);
    assert.equal(sent[0].body.content,'.dls');assert.equal(sent[0].body.message_reference.message_id,'123');
    assert.deepEqual(sent[0].body.allowed_mentions,{parse:[],replied_user:false});finish();await pending;
    await r.dispose();await plugin.download(message);assert.equal(sent.length,1);
});

test('Nighty lazy menus stay bound to the opened message, recheck toggles and clean up pending opens',async()=>{
    const {default:factory}=await import('../src/plugins/nighty-tab.js');
    const opened=[];const sheets={openLazy:(component,key,props)=>opened.push({component,key,props}),hideActionSheet(){}};
    let sends=[];const http={get(){},put(){},del(){},post:async req=>sends.push(req)};
    const {r}=await harness({...factory.defaults,scriptUtils:true},[sheets,http]);const plugin=factory(r);plugin.start();
    function ActionSheetRow(){return null;}function ActionSheetRowGroup({children}){return children;}
    const module={default:()=>React.createElement('View',null,React.createElement(ActionSheetRowGroup,null,[React.createElement(ActionSheetRow,{key:'original',label:'Original'})]))};
    for(const id of ['a','b']) sheets.openLazy(Promise.resolve(module),'MessageLongPressActionSheet',{message:{id,channel_id:'ch',attachments:[{}]}});
    const a=await opened[0].component,b=await opened[1].component;
    const rows=component=>component.default({}).props.children.props.children;
    rows(a)[1].props.onPress();await tick();rows(b)[1].props.onPress();await tick();
    assert.deepEqual(sends.map(s=>s.body.message_reference.message_id),['a','b']);
    assert.equal(module.default({}).props.children.props.children.length,1);
    r.set('scriptUtils',false);assert.equal(rows(a).length,1);r.set('scriptUtils',true);
    let resolve;sheets.openLazy(new Promise(r=>resolve=r),'MessageLongPressActionSheet',{message:{id:'c',channel_id:'ch',attachments:[{}]}});
    await r.dispose();resolve(module);assert.equal(await opened[2].component,module);assert.equal(rows(a).length,1);
});

test('Nighty WebView has isolated cookies, no credential bridge, and reports invalid URL',async()=>{
    const {default:factory}=await import('../src/plugins/nighty-tab.js');
    const {r}=await harness({...factory.defaults,url:'https://example.com'},[{WebView:'WebView'}]);const plugin=factory(r);let tree;
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(plugin.NightyPage));});
    const props=tree.root.findByType('WebView').props;
    assert.equal(props.sharedCookiesEnabled,false);assert.equal(props.thirdPartyCookiesEnabled,false);assert.equal(typeof props.onMessage,'function');
    assert.match(props.injectedJavaScript,/access_token/);assert.doesNotMatch(props.injectedJavaScript,/getToken|discord\.com/);
    assert.equal(props.source.headers,undefined);
    await Renderer.act(async()=>props.onMessage({nativeEvent:{data:JSON.stringify({type:'OTHER',token:'discord-token-value'})}}));
    assert.deepEqual(r.store.sessions,{});
    await Renderer.act(async()=>props.onMessage({nativeEvent:{data:JSON.stringify({type:'NIGHTY_TOKEN',token:'nighty-login-token'})}}));
    assert.equal(r.store.sessions['example.com'],'nighty-login-token');
    const saved=tree.root.findByType('WebView').props;
    assert.equal(saved.source.headers.Cookie,'access_token=nighty-login-token');
    assert.match(saved.injectedJavaScriptBeforeContentLoaded,/nighty-login-token/);
    assert.equal(props.onShouldStartLoadWithRequest({url:'file:///local'}),false);
    assert.equal(props.onShouldStartLoadWithRequest({url:'about:blank'}),true);
    assert.equal(props.onShouldStartLoadWithRequest({url:'https://example.com/'}),true);
    assert.equal(props.style.flex, 1);
    assert.equal(props.style.height, undefined);
    assert.equal(tree.root.findAllByType('Button').length,0);assert.equal(tree.root.findAllByType('Text').length,0);
    await Renderer.act(async()=>{r.set('url','bad');});assert.match(JSON.stringify(tree.toJSON()),/valid HTTP/);
    await Renderer.act(async()=>tree.unmount());await r.dispose();
});

test('Nighty uses a contained small icon and a headerless native route',async()=>{
    const {default:factory}=await import('../src/plugins/nighty-tab.js');
    const constants={SETTING_RENDERER_CONFIG:{}},lists={createList:v=>v};let route,options;
    const nav={navigate:(name,params)=>{route={name,params};},setOptions:value=>{options=value;},getCurrentRoute:()=>route,goBack(){}};
    const {r,common}=await harness(factory.defaults,[constants,lists,{getRootNavigationRef:()=>nav}]);
    common.NavigationNative={useRoute:()=>route,useNavigation:()=>nav};factory(r).start();
    let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(constants.SETTING_RENDERER_CONFIG.MIME_NIGHTY.IconComponent));});
    assert.deepEqual(tree.root.findByType('Image').props.style,{width:18,height:18});assert.equal(tree.root.findByType('Image').props.resizeMode,'contain');
    await Renderer.act(async()=>tree.unmount());await constants.SETTING_RENDERER_CONFIG.MIME_NIGHTY.onPress();
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(constants.SETTING_RENDERER_CONFIG.MIME_PLUGIN_SETTINGS_PAGE.screen.getComponent()));});
    assert.equal(options.headerShown,false);await Renderer.act(async()=>tree.unmount());await r.dispose();
});

test('Pin DMs FlashList keeps auxiliary rows, host callbacks, layouts and imperative scroll targets',async()=>{
    const {default:factory}=await import('../src/plugins/pin-dms.js');
    const channels={a:{id:'a',type:1},b:{id:'b',type:3}};
    const {r}=await harness(factory.defaults,[{storeName:'ChannelStore',getChannel:id=>channels[id]},{storeName:'UserStore',getCurrentUser:()=>({id:'owner'})},{storeName:'PrivateChannelSortStore',getPrivateChannelIds:()=>['a','b']}]);
    const p=factory(r),category=p.data.save(null,'Friends',0,'b');
    const values=[{kind:'search'},{channelId:'a'},{...channels.b},{kind:'footer'}],ref=React.createRef();let viewed,scrolled,layoutItem;
    const original=React.createElement('FlashList',{ref,data:values,extraData:'host',initialScrollIndex:1,keyExtractor:(_,i)=>'host-'+i,
        renderItem:({item,index})=>React.createElement('DM',{item,index}),getItemLayout:(_,i)=>({length:30+i*10,offset:0,index:i}),
        getItemType:(item,index)=>{assert.equal(item,values[index]);return 'host';},overrideItemLayout:(_layout,item,index)=>{layoutItem={item,index};},
        onViewableItemsChanged:payload=>{viewed=payload;}});
    let tree;await Renderer.act(async()=>{tree=Renderer.create(p.adaptList(original),{createNodeMock:()=>({scrollToIndex:args=>{scrolled=args;},scrollToItem:args=>{scrolled=args;}})});});
    let list=tree.root.findByType('FlashList');assert.equal(list.props.data[0].item,values[0]);assert.equal(list.props.data.at(-1).item,values[3]);
    const b=list.props.data.find(row=>row.id==='b');assert.equal(list.props.renderItem({item:b}).props.index,2);assert.equal(list.props.initialScrollIndex,4);
    assert.deepEqual(list.props.getItemLayout(list.props.data,4),{index:4,length:40,offset:176});
    assert.equal(list.props.getItemType(b,2),'host');list.props.overrideItemLayout({},b,2);assert.deepEqual(layoutItem,{item:values[2],index:2});
    list.props.onViewableItemsChanged({viewableItems:[{item:list.props.data[1],index:1},{item:b,index:2}],changed:[{item:b,index:2}]});
    assert.equal(viewed.viewableItems.length,1);assert.equal(viewed.viewableItems[0].item,values[2]);assert.equal(viewed.viewableItems[0].key,'host-2');
    ref.current.scrollToIndex({index:1,animated:false});assert.deepEqual(scrolled,{index:4,animated:false});
    await Renderer.act(async()=>p.data.collapse(category));ref.current.scrollToIndex({index:2});assert.equal(scrolled.index,1);
    await Renderer.act(async()=>r.dispose());list=tree.root.findByType('FlashList');assert.equal(list.props.data,values);ref.current.scrollToIndex({index:1});assert.equal(scrolled.index,1);
    await Renderer.act(async()=>tree.unmount());assert.equal(ref.current,null);
});

test('Pin DMs augments nested native channel menus and creates a category from holding a native row',async()=>{
    const {default:factory}=await import('../src/plugins/pin-dms.js');
    const channel={id:'dm',type:1,recipients:['friend']};
    function ActionSheetRow(){return null;}function ActionSheetRowGroup({children}){return children;}
    function Content(){return React.createElement('View',null,React.createElement(ActionSheetRowGroup,null,[React.createElement(ActionSheetRow,{key:'original',label:'Original'})]));}
    const module={name:'ChannelLongPressActionSheet',default:props=>React.createElement(Content,props)},original=module.default;
    const {r,sheets,hooks}=await harness(factory.defaults,[module,{storeName:'ChannelStore',getChannel:id=>id==='dm'?channel:null},{storeName:'UserStore',getCurrentUser:()=>({id:'owner'})},{storeName:'PrivateChannelSortStore',getPrivateChannelIds:()=>['dm']}]);
    const p=factory(r);p.start();let tree;
    await Renderer.act(async()=>{tree=Renderer.create(module.default({channel}));});
    assert.deepEqual(tree.root.findAllByType(ActionSheetRow).map(row=>row.props.label),['Original','Pin DMs']);
    await Renderer.act(async()=>tree.root.findAllByType(ActionSheetRow)[1].props.onPress());assert.equal(sheets.size,1);
    await Renderer.act(async()=>tree.unmount());sheets.clear();
    const wrapped=hooks.get('MessagesItemChannelContent')(null,React.createElement('DMContent',{channel}));
    await Renderer.act(async()=>wrapped.props.onLongPress({stopPropagation(){}}));
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement([...sheets.values()][0]));});
    await Renderer.act(async()=>tree.root.findAllByType('Pressable').find(button=>button.props.accessibilityLabel==='New category').props.onPress());
    await Renderer.act(async()=>tree.unmount());
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement([...sheets.values()][0]));});
    await Renderer.act(async()=>tree.root.findAllByType('RNInput')[0].props.onChangeText('Friends'));
    await Renderer.act(async()=>tree.root.findAllByType('Pressable').find(button=>button.props.accessibilityLabel==='Save').props.onPress());
    assert.equal(p.data.categories()[0].name,'Friends');assert.deepEqual(p.data.categories()[0].channels,['dm']);
    await Renderer.act(async()=>tree.unmount());await r.dispose();assert.equal(module.default,original);
});

test('Pin DMs preserves account isolation, categories, colors, moves, transfers and unpinning',async()=>{
    const {createPinData}=await import('../src/plugins/pin-dms-data.js');let user='alice';
    const {r}=await harness({userBasedCategoryList:{}},[{storeName:'UserStore',getCurrentUser:()=>({id:user})}]);const d=createPinData(r);
    const first=d.save(null,'First',0xabcdef,'one'),second=d.save(null,'Second',0x123456,'two');
    d.pin('three',first);d.moveChannel('three',-1);assert.deepEqual(d.categories()[0].channels,['three','one']);
    d.moveCategory(second,-1);assert.equal(d.categories()[0].id,second);d.save(first,'Renamed',0xff0000);
    d.collapse(first);assert.equal(d.categories()[1].collapsed,true);assert.equal(d.categories()[1].color,0xff0000);
    d.pin('one',second);assert.deepEqual(d.categories()[1].channels,['three']);d.unpin('one');assert.deepEqual(d.categories()[0].channels,['two']);
    user='bob';assert.deepEqual(d.categories(),[]);d.save(null,'Bob',0);user='alice';assert.equal(d.categories().length,2);
    d.remove(first);assert.equal(d.categories().length,1);assert.throws(()=>d.save(null,'',0));
    user=null;assert.throws(()=>d.save(null,'No account',0),/Sign in/);await r.dispose();
});

test('Pin DMs section projection matches recency/custom order, collapse and selected row rules',async()=>{
    const {sectionsFor}=await import('../src/plugins/pin-dms-data.js');
    const categories=[{id:'cat',name:'Pins',channels:['one','two','missing'],collapsed:false}];
    const settings={pinOrder:0,canCollapseDmSection:true,dmSectionCollapsed:false};
    const recent=['three','two','one'];const exists=id=>id!=='missing';
    assert.deepEqual(sectionsFor(categories,settings,recent,'one',exists).map(s=>s.data),[['two','one'],['three']]);
    settings.pinOrder=1;assert.deepEqual(sectionsFor(categories,settings,recent,'one',exists)[0].data,['one','two']);
    categories[0].collapsed=true;settings.dmSectionCollapsed=true;
    assert.deepEqual(sectionsFor(categories,settings,recent,'one',exists).map(s=>s.data),[['one'],[]]);
    settings.canCollapseDmSection=false;assert.deepEqual(sectionsFor(categories,settings,recent,'one',exists)[1].data,['three']);
});

test('Pin DMs native list wraps only supported private-channel shapes and updates without mutating rows',async()=>{
    const {default:factory}=await import('../src/plugins/pin-dms.js');const channels={a:{id:'a',type:1},b:{id:'b',type:3},g:{id:'g',type:0}};
    const modules=[{storeName:'ChannelStore',getChannel:id=>channels[id]},{storeName:'UserStore',getCurrentUser:()=>({id:'test-user'})},{storeName:'PrivateChannelSortStore',getPrivateChannelIds:()=>['a','b']}];
    const {r}=await harness(factory.defaults,modules);const p=factory(r);p.data.save(null,'Pinned',0,'b');
    const values=[channels.a,channels.b], renderItem=({item,index})=>React.createElement('DM',{id:item.id,index});
    const element=React.createElement('FlatList',{data:values,renderItem});const wrapped=p.adaptList(element);assert(wrapped);
    assert.equal(p.adaptList(React.createElement('FlatList',{data:[channels.g],renderItem})),undefined);
    assert.equal(p.adaptList(React.createElement('FlatList',{data:values,renderItem,searchQuery:'a'})),undefined);
    let tree;await Renderer.act(async()=>{tree=Renderer.create(wrapped);});let flat=tree.root.findByType('FlatList');
    assert.deepEqual(flat.props.data.filter(v=>v.id).map(v=>v.id),['b','a']);assert.equal(flat.props.renderItem({item:flat.props.data.find(v=>v.id==='b')}).props.index,1);
    assert.equal(element.props.data,values);assert.deepEqual(values,[channels.a,channels.b]);
    await Renderer.act(async()=>{p.data.collapse(p.data.categories()[0].id);});flat=tree.root.findByType('FlatList');
    assert.deepEqual(flat.props.data.filter(v=>v.id).map(v=>v.id),['a']);
    await Renderer.act(async()=>tree.unmount());await r.dispose();
});

test('registrar owns IDs and command-list insertion, preserving shouldHide and automatic results',async()=>{
    const module={getBuiltInCommands:()=>['original']},original=module.getBuiltInCommands;
    const {r,commands}=await harness({},[module]);let sends=0;
    r.B.commands.registerCommand=command=>{
        command.id='-987';const execute=command.execute;
        command.execute=async(...args)=>{const result=await execute(...args);if(result?.content)sends++;};
        commands.set(command.name,command);return()=>commands.delete(command.name);
    };
    const hidden=()=>true;r.command({name:'owned',description:'Fixture',shouldHide:hidden,execute:()=>({content:'one'})});
    assert.equal(commands.get('owned').id,'-987');assert.equal(commands.get('owned').shouldHide,hidden);
    assert.equal(module.getBuiltInCommands,original);await commands.get('owned').execute([],{channel:{id:'ch'}});assert.equal(sends,1);
    await r.dispose();assert.equal(commands.size,0);
});

test('shared controls subscribe to owned storage and never pass modern props to CompatButton',async()=>{
    const {ui}=await import('../src/runtime.js');const {r}=await harness();let subscriptions=0;
    r.B.plugin.useProxy=value=>{assert.equal(value,r.store);subscriptions++;return value;};
    delete r.D.Button;r.C.Button='CompatButton';
    const U=ui(r);function View(){r.useRefresh();return React.createElement(U.Button,{text:'Native fallback',onPress(){}});}
    let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(View));});
    assert(subscriptions>0);assert.equal(tree.root.findAllByType('CompatButton').length,0);
    assert.equal(tree.root.findByType('Pressable').props.accessibilityRole,'button');
    await Renderer.act(async()=>tree.unmount());await r.dispose();
});

test('runtime migrates missing defaults without overwriting false and isolates new nested defaults',async()=>{
    const {createRuntime}=await import('../src/runtime.js');const defaults={enabled:true,nested:{list:[]}};
    const a=await harness(),b=await harness();
    a.B.plugin.createStorage=initial=>initial;b.B.plugin.createStorage=initial=>initial;
    const x=createRuntime(a.B,{name:'a',id:'a'},defaults),y=createRuntime(b.B,{name:'b',id:'b'},defaults);
    x.store.nested.list.push('a');assert.deepEqual(y.store.nested.list,[]);assert.deepEqual(defaults.nested.list,[]);
    const existing={enabled:false};a.B.plugin.createStorage=()=>existing;
    const migrated=createRuntime(a.B,{name:'c',id:'c'},defaults);assert.equal(migrated.store.enabled,false);assert.deepEqual(existing.nested.list,[]);
    await Promise.all([a.r.dispose(),b.r.dispose(),x.dispose(),y.dispose(),migrated.dispose()]);
});

test('stop cancels pending waits and prevents local output, copies and dialogs after stop',async()=>{
    const {r,calls,sheets}=await harness();const pending=r.wait(60000);await r.dispose();
    await assert.rejects(pending,/stopped/);r.local('ch','late');r.copy('late');r.api.ui.openAlert('late','late');
    assert.equal(calls.length,0);assert.equal(sheets.size,0);assert.throws(()=>r.open('late',()=>null),/stopped/);
});

test('settings use the Rain navigation route and keep the second plugin functional after first stops',async()=>{
    const {registerSection}=await import('../src/settings-section.js');
    const constants={SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}},lists={createList:config=>config};
    let route,backs=0,options;
    const nav={navigate:(name,params)=>{route={name,params};},goBack:()=>{backs++;route=null;},getCurrentRoute:()=>route,setOptions:v=>{options=v;}};
    const ref={getRootNavigationRef:()=>nav};
    const a=await harness({},[constants,lists,ref]),b=await harness({},[constants,lists,ref]);
    a.r.meta.id='a';b.r.meta.id='b';
    a.common.NavigationNative=b.common.NavigationNative={useRoute:()=>route,useNavigation:()=>nav};
    for(const [fixture,key] of [[a,'A'],[b,'B']])registerSection(fixture.r,{name:key,items:[{key,title:()=>key,render:async()=>({default:()=>React.createElement('Page',{id:key})})}]});
    await constants.SETTING_RENDERER_CONFIG.A.onPress();assert.equal(route.name,'MIME_PLUGIN_SETTINGS_PAGE');assert.equal(a.sheets.size,0);
    let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(constants.SETTING_RENDERER_CONFIG.MIME_PLUGIN_SETTINGS_PAGE.screen.getComponent()));});
    assert.equal(tree.root.findByType('Page').props.id,'A');assert.equal(options.title,'A');await Renderer.act(async()=>tree.unmount());
    await a.r.dispose();assert.equal(backs,1);
    await constants.SETTING_RENDERER_CONFIG.B.onPress();assert.equal(route.params.owner,'b');
    assert(lists.createList({sections:[{settings:['ACCOUNT']}]}).sections.some(s=>s.label==='B'));
    await b.r.dispose();assert.equal(backs,2);assert.equal(constants.SETTING_RENDERER_CONFIG.MIME_PLUGIN_SETTINGS_PAGE,undefined);
});

test('Nighty profile toggle adds a button beside Settings and removes it',async()=>{
    const {default:factory}=await import('../src/plugins/nighty-tab.js');
    const {r,sheets}=await harness({...factory.defaults,showNightyButton:true,url:'https://example.com'});
    const plugin=factory(r);plugin.start();assert.equal(r.status.profileButton,'patched');
    const toolbarFont={fontFamily:'gg sans',fontSize:12,fontWeight:'600',lineHeight:16,color:'#F2F3F5'};
    const pressable=(key,label)=>React.createElement('Pressable',{key,accessibilityLabel:label,onPress(){}},React.createElement('Text',{style:toolbarFont},label));
    const row=()=>React.createElement('View',{testID:'profile-toolbar'},[
        pressable('quests','Quests'),pressable('shop','Shop'),pressable('settings','Settings'),
    ]);
    let tree;await Renderer.act(async()=>{tree=Renderer.create(row());});
    const bar=tree.toJSON();
    assert.equal(bar.children[0].props.accessibilityLabel,'Quests');
    assert.equal(bar.children[1].props.accessibilityLabel,'Shop');
    assert.equal(bar.children[2].props.accessibilityLabel,'Settings');
    assert.equal(bar.children[3].props.accessibilityLabel,'Nighty');
    assert.equal(bar.children[3].props.testID,'mime-nighty-profile-button');
    assert.equal(bar.children[3].type,'Pressable');
    const stack=bar.children[3].children[0];
    assert.equal(stack.type,'View');
    assert.deepEqual(stack.props.style,{width:52,height:40,alignItems:'center',justifyContent:'center',overflow:'visible'});
    const glyph=stack.children[0];
    assert.equal(glyph.type,'Image');
    assert.match(glyph.props.source.uri,/^data:image\/png;base64,/);
    assert.equal(glyph.props.tintColor,undefined);
    assert.deepEqual(glyph.props.style,{width:48,height:32});
    assert.equal(stack.children[1],undefined);
    assert.equal(bar.children[3].props.style.flexDirection,'column');
    assert.equal(bar.children[3].props.style.flex,1);
    assert.equal(r.status.profileButton,'added');
    await Renderer.act(async()=>tree.root.findByProps({accessibilityLabel:'Settings'}).props.onPress());
    assert.equal(sheets.size,0);
    await Renderer.act(async()=>tree.root.findByProps({testID:'mime-nighty-profile-button'}).props.onPress());
    assert.equal(sheets.size,0);
    assert.equal(tree.root.findByType('Modal').props.presentationStyle,'fullScreen');
    const close=tree.root.findByProps({accessibilityLabel:'Close'});
    assert.equal(close.type,'Pressable');
    assert.equal(close.props.children.props.children,'✕');
    assert.equal(tree.root.findAllByType('Button').length,0);
    await Renderer.act(async()=>close.props.onPress());
    assert.equal(tree.root.findAllByType('Modal').length,0);
    await Renderer.act(async()=>tree.unmount());sheets.clear();
    const wrapped=()=>React.createElement('View',{testID:'wrapped-toolbar'},[
        React.createElement('View',{key:'quests'},pressable('quests','Quests')),
        React.createElement('View',{key:'settings'},pressable('settings','Settings')),
    ]);
    await Renderer.act(async()=>{tree=Renderer.create(wrapped());});
    assert.equal(tree.toJSON().children[1].children[0].props.accessibilityLabel,'Settings');
    assert.equal(tree.toJSON().children[2].props.accessibilityLabel,'Nighty');
    await Renderer.act(async()=>tree.unmount());
    const unrelated=()=>React.createElement('View',null,[pressable('settings','Settings'),pressable('edit','Edit profile')]);
    await Renderer.act(async()=>{tree=Renderer.create(unrelated());});
    assert.deepEqual(tree.toJSON().children.map(child=>child.props.accessibilityLabel),['Settings','Edit profile']);
    await Renderer.act(async()=>tree.unmount());
    r.set('showNightyButton',false);
    await Renderer.act(async()=>{tree=Renderer.create(row());});
    assert.equal(tree.toJSON().children.length,3);
    assert.equal(tree.toJSON().children[2].props.accessibilityLabel,'Settings');
    await Renderer.act(async()=>tree.unmount());
    r.set('showNightyButton',true);
    const i18nRow=()=>React.createElement('View',{testID:'i18n-toolbar'},[
        React.createElement('Pressable',{key:'quests',accessibilityLabel:{id:'QUESTS',message:'Misiones'},onPress(){}}),
        React.createElement('Pressable',{key:'settings',accessibilityLabel:{id:'USER_SETTINGS',message:'Ajustes'},onPress(){}}),
    ]);
    await Renderer.act(async()=>{tree=Renderer.create(i18nRow());});
    assert.equal(tree.toJSON().children[0].props.accessibilityLabel.message,'Misiones');
    assert.equal(tree.toJSON().children[1].props.accessibilityLabel.message,'Ajustes');
    assert.equal(tree.toJSON().children[2].props.accessibilityLabel,'Nighty');
    await Renderer.act(async()=>tree.unmount());
    const actionRow=()=>React.createElement('View',{actions:[
        {key:'shop',id:'shop',label:'Shop',icon:'shop',onPress(){}},{key:'settings',id:'settings',label:'Settings',icon:'gear',onPress(){}},
    ]});
    await Renderer.act(async()=>{tree=Renderer.create(actionRow());});
    const actions=tree.toJSON().props.actions;
    assert.equal(actions[1].label,'Settings');
    assert.equal(actions[1].id,'settings');
    assert.equal(actions[1].icon,'gear');
    assert.equal(actions[2].label,'Nighty');
    assert.equal(actions[2].id,'mime-nighty-profile-button');
    assert.equal(actions[2].icon.type,'Image');
    assert.match(actions[2].icon.props.source.uri,/^data:image\/png;base64,/);
    await Renderer.act(async()=>actions[1].onPress());
    assert.equal(sheets.size,0);
    await Renderer.act(async()=>actions[2].onPress());
    assert.equal(sheets.size,1);
    await Renderer.act(async()=>tree.unmount());sheets.clear();
    const countNighty=node=>{
        let count=0;
        const walk=value=>{
            if(!value||typeof value!=='object')return;
            if(value.props?.testID==='mime-nighty-profile-button')count++;
            const kids=value.children;
            if(Array.isArray(kids))kids.forEach(walk);
        };
        walk(node);
        return count;
    };
    const nitroScreen=()=>React.createElement('View',{testID:'profile-v354'},[
        React.createElement('View',{key:'nitro-row',testID:'nitro-row'},[
            pressable('nitro','Nitro'),pressable('settings-nitro','Settings'),
        ]),
        React.createElement('View',{key:'quest-row',testID:'quest-row'},[
            pressable('quests2','Quests'),pressable('shop2','Shop'),pressable('settings2','Settings'),
        ]),
    ]);
    await Renderer.act(async()=>{tree=Renderer.create(nitroScreen());});
    const profile=tree.toJSON();
    assert.equal(countNighty(profile),1);
    assert.equal(profile.children[0].children[2].props.accessibilityLabel,'Nighty');
    assert.equal(profile.children[1].children.some(child=>child?.props?.testID==='mime-nighty-profile-button'),false);
    await Renderer.act(async()=>tree.unmount());
    const nested=()=>React.createElement('View',{testID:'outer'},[
        React.createElement('View',{key:'inner',testID:'inner'},[
            pressable('quests3','Quests'),pressable('settings3','Settings'),
        ]),
        pressable('nitro2','Nitro'),
        pressable('settings4','Settings'),
    ]);
    await Renderer.act(async()=>{tree=Renderer.create(nested());});
    assert.equal(countNighty(tree.toJSON()),1);
    assert.equal(tree.toJSON().children[0].children[2].props.accessibilityLabel,'Nighty');
    assert.deepEqual(tree.toJSON().children.slice(1).map(child=>child.props.accessibilityLabel),['Nitro','Settings']);
    await Renderer.act(async()=>tree.unmount());
    const nitroOnly=()=>React.createElement('View',null,[
        React.createElement('Pressable',{key:'nitro',accessibilityLabel:{id:'NITRO',message:'Nitro'},onPress(){}}),
        React.createElement('Pressable',{key:'settings',accessibilityLabel:{id:'USER_SETTINGS',message:'Settings'},onPress(){}}),
    ]);
    await Renderer.act(async()=>{tree=Renderer.create(nitroOnly());});
    assert.equal(countNighty(tree.toJSON()),1);
    assert.equal(tree.toJSON().children[2].props.accessibilityLabel,'Nighty');
    await Renderer.act(async()=>tree.unmount());
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(plugin.Settings));});
    assert(tree.root.findAllByType('Switch').some(row=>row.props.accessibilityLabel==='Profile Nighty button'&&row.props.value===true));
    await Renderer.act(async()=>tree.unmount());
    await r.dispose();
    await Renderer.act(async()=>{tree=Renderer.create(row());});
    assert.equal(tree.toJSON().children.length,3);
    assert.equal(tree.toJSON().children[2].props.accessibilityLabel,'Settings');
    await Renderer.act(async()=>tree.unmount());
});

test('Nighty profile button opens Nighty directly and leaves Settings alone',async()=>{
    const {default:factory}=await import('../src/plugins/nighty-tab.js');
    let pushed, settingsPresses=0, pops=0;
    function Navigator(props){return React.createElement('Navigator',props);}
    const navigation={push(screen){pushed=screen;},pop(){pops++;},pushLazy(){}};
    const closeButton={getRenderCloseButton(onPress){return ()=>React.createElement('Close',{onPress,accessibilityLabel:'Close'});}};
    const {r,sheets}=await harness({...factory.defaults,showNightyButton:true,url:'https://example.com'},[navigation,{Navigator},{WebView:'WebView'},closeButton]);
    factory(r).start();
    const pressable=(key,label,onPress)=>React.createElement('Pressable',{key,accessibilityLabel:label,onPress});
    const row=()=>React.createElement('View',null,[
        pressable('quests','Quests',()=>{}),
        pressable('settings','Settings',()=>{settingsPresses++;}),
    ]);
    let tree;await Renderer.act(async()=>{tree=Renderer.create(row());});
    assert.equal(tree.toJSON().children[2].children[0].children[0].props.tintColor,undefined);
    assert.match(tree.toJSON().children[2].children[0].children[0].props.source.uri,/^data:image\/png;base64,/);
    assert.deepEqual(tree.toJSON().children[2].children[0].children[0].props.style,{width:48,height:32});
    assert.equal(tree.toJSON().children[2].children[0].children[1],undefined);
    assert.equal(tree.toJSON().children[2].props.style.flexDirection,'column');
    await Renderer.act(async()=>tree.root.findByProps({testID:'mime-nighty-profile-button'}).props.onPress());
    assert.equal(settingsPresses,0);
    assert.equal(sheets.size,0);
    assert.equal(tree.root.findAllByType('Modal').length,0);
    let screen;await Renderer.act(async()=>{screen=Renderer.create(React.createElement(pushed));});
    const nav=screen.root.findByType('Navigator');
    assert.equal(nav.props.initialRouteName,'Nighty');
    assert.equal(nav.props.screens.Nighty.title,'Nighty');
    assert.equal(nav.props.screens.Nighty.headerBackVisible,false);
    assert.equal(typeof nav.props.screens.Nighty.headerLeft,'function');
    let header;await Renderer.act(async()=>{header=Renderer.create(React.createElement(nav.props.screens.Nighty.headerLeft));});
    const headerClose=header.root.findByType('Close');
    assert.equal(headerClose.props.accessibilityLabel,'Close');
    await Renderer.act(async()=>headerClose.props.onPress());
    assert.equal(pops,1);
    let page;await Renderer.act(async()=>{page=Renderer.create(nav.props.screens.Nighty.render());});
    assert.equal(page.root.findByType('WebView').props.style.flex,1);
    assert.equal(page.root.findByType('WebView').props.style.height,undefined);
    await Renderer.act(async()=>{tree.unmount();screen.unmount();page.unmount();header.unmount();});
    await r.dispose();
});

test('Nighty adds its button inside the You screen without wrapping the screen',async()=>{
    const {default:factory}=await import('../src/plugins/nighty-tab.js');
    function YouScreen(){return React.createElement('View',{testID:'you-screen'},[
        React.createElement('Pressable',{key:'quests',accessibilityLabel:'Quests',onPress(){}}),
        React.createElement('Pressable',{key:'settings',accessibilityLabel:'Settings',onPress(){}}),
    ]);}
    const screen={name:'YouScreen',default:YouScreen};
    const {r,hooks}=await harness({...factory.defaults,showNightyButton:true},[screen]);
    const plugin=factory(r);plugin.start();
    assert.equal(hooks.size,0);
    let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(YouScreen));});
    assert.equal(tree.toJSON().children[1].props.accessibilityLabel,'Settings');
    assert.equal(tree.toJSON().children[2].props.accessibilityLabel,'Nighty');
    assert.equal(tree.toJSON().children[2].type,'Pressable');
    assert.equal(tree.toJSON().children[2].children[0].type,'View');
    assert.match(tree.toJSON().children[2].children[0].children[0].props.source.uri,/^data:image\/png;base64,/);
    assert.equal(tree.toJSON().children[2].children[0].children[0].props.tintColor,undefined);
    assert.equal(tree.toJSON().children[2].props.style.flexDirection,'column');
    assert.deepEqual(tree.toJSON().children[2].children[0].children[0].props.style,{width:48,height:32});
    assert.equal(tree.toJSON().children[2].children[0].children[1],undefined);
    await Renderer.act(async()=>tree.unmount());
    await r.dispose();
    assert.equal(hooks.size,0);
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(YouScreen));});
    assert.equal(tree.toJSON().children.length,2);
    assert.equal(tree.toJSON().children[1].props.accessibilityLabel,'Settings');
    await Renderer.act(async()=>tree.unmount());
});

test('Nighty accepts native message models and nested HTTP exports without reading credentials',async()=>{
    const {default:factory,canDownload}=await import('../src/plugins/nighty-tab.js');
    const message={id:'message',getChannelId:()=> 'native-channel',attachments:[{}]};let sent;
    const http={HTTP:{post:async req=>{sent=req;}},get(){},post(){throw new Error('Wrong export');},put(){},patch(){},del(){}};
    const {r}=await harness({...factory.defaults,scriptUtils:true},[http,{getToken(){throw new Error('Must not read token');}}]);
    assert(canDownload(r.store,message));await factory(r).download(message);assert.equal(sent.url,'/channels/native-channel/messages');
    assert.equal(sent.body.message_reference.channel_id,'native-channel');await r.dispose();
});

test('Pin category Save waits for persistence, retries the same category and rejects account changes',async()=>{
    const {default:factory}=await import('../src/plugins/pin-dms.js');let user='one';
    const {r}=await harness(factory.defaults,[{storeName:'UserStore',getCurrentUser:()=>({id:user})}]);const p=factory(r);let close=0,tree;
    const old=console.error;console.error=()=>{};
    try {
        r.B.plugin.flushStorage=async()=>{throw new Error('Disk failure');};
        await Renderer.act(async()=>{tree=Renderer.create(React.createElement(p.Editor,{close:()=>close++}));});
        await Renderer.act(async()=>{await tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel==='Save').props.onPress();});
        assert.equal(close,0);assert.equal(p.data.categories().length,1);const saved=p.data.categories()[0].id;
        r.B.plugin.flushStorage=async()=>{};
        await Renderer.act(async()=>{await tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel==='Save').props.onPress();});
        assert.equal(close,1);assert.equal(p.data.categories().length,1);assert.equal(p.data.categories()[0].id,saved);
        user='two';await Renderer.act(async()=>{await tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel==='Save').props.onPress();});
        assert.equal(p.data.categories().length,0);assert.equal(close,1);
    } finally {console.error=old;await Renderer.act(async()=>tree?.unmount());await r.dispose();}
});

test('InstallLinks uses supported manual installation and restores URL regex patches',async()=>{
    const {default:factory}=await import('../src/plugins/install-links.js');
    const parser={URL_REGEX:/https?:\/\/[^ ]+/};const original=parser.URL_REGEX;
    const {r,commands,sheets,calls}=await harness({},[parser]);let forbidden=0;
    r.B.native={previewExternalPlugin(){forbidden++;throw new Error('Unsupported');}};
    r.B.plugins={installPlugin(){forbidden++;throw new Error('Unsupported');}};
    const p=factory(r);p.start();
    const result=await commands.get('installplugin').execute([{name:'url',value:'https://example.com/plugin/'}]);
    assert.equal(result,undefined);assert.equal(forbidden,0);assert.equal(calls.length,0);assert.equal(sheets.size,1);
    let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement([...sheets.values()][0]));});
    assert.match(JSON.stringify(tree.toJSON()),/Install from URL/);
    await Renderer.act(async()=>tree.root.findAllByType('Pressable').find(b=>b.props.accessibilityLabel==='Copy manifest URL').props.onPress());
    assert.deepEqual(calls,['https://example.com/plugin/manifest.json']);
    await Renderer.act(async()=>tree.unmount());p.stop();await r.dispose();assert.equal(parser.URL_REGEX,original);
});

test('BetterDelete moves Delete into the Edit group and sends the logger replacement',async()=>{
    const {default:factory,placeMessageActions,runBetterDelete,isOwnMessage}=await import('../src/plugins/better-delete.js');
    function Row(props){return React.createElement('Text',null,props.label);}
    Row.displayName='ActionSheetRow';
    const nativeDelete=()=>{};
    const tree=React.createElement('Sheet',null,
        React.createElement('Hint',null,'Double tap a message to Edit'),
        React.createElement('Group',null,
            React.createElement(Row,{key:'edit',label:'Edit Message',onPress(){}}),
            React.createElement(Row,{key:'reply',label:'Reply',onPress(){}}),
            React.createElement(Row,{key:'forward',label:'Forward',onPress(){}})),
        React.createElement('Group',null,
            React.createElement(Row,{key:'copy',label:'Copy Text',onPress(){}}),
            React.createElement(Row,{key:'pin',label:'Pin Message',onPress(){}})),
        React.createElement('Group',null,React.createElement(Row,{key:'delete',label:'Delete Message',onPress:nativeDelete})));
    const labels=node=>{
        const found=[];
        const walk=value=>{
            if(!value)return;
            if(Array.isArray(value)){value.forEach(walk);return;}
            if(value.props?.label)found.push(value.props.label);
            if(value.props?.children)walk(value.props.children);
        };
        walk(node);
        return found;
    };
    const moved=placeMessageActions(React,tree,{showBetter:true,canDelete:true,onBetter(){},onDelete(){}});
    assert.deepEqual(labels(moved.props.children[1]),['Edit Message','Reply','Forward','Delete Message','Silent Delete Message']);
    assert.deepEqual(labels(moved.props.children[2]),['Copy Text','Pin Message']);
    assert.equal(moved.props.children[3],undefined);
    const again=placeMessageActions(React,moved,{showBetter:true,canDelete:true,onBetter(){},onDelete(){}});
    assert.deepEqual(labels(again),labels(moved));
    const other=placeMessageActions(React,tree,{showBetter:false,canDelete:false,onBetter(){},onDelete(){}});
    assert.deepEqual(labels(other.props.children[1]),['Edit Message','Reply','Forward','Delete Message']);
    let sent=0, deleted=0;
    await assert.rejects(runBetterDelete({deleteMessage:async()=>{deleted++;throw new Error('denied');},_sendMessage:async()=>{sent++;}},null,'1','2','secret'));
    assert.equal(deleted,1);assert.equal(sent,0);
    const calls=[];
    const text=await runBetterDelete({
        deleteMessage:async(...args)=>calls.push(['delete',args]),
        _sendMessage:async(...args)=>{calls.push(['send',args]);return {id:'333'};},
    },async()=>{throw new Error('REST should not run');},'222','111','  ');
    assert.equal(text,'redacted eh');
    assert.deepEqual(calls,[
        ['delete',['222','111']],
        ['send',['222',{content:'redacted eh',tts:false,invalidEmojis:[],validNonShortcutEmojis:[]},{nonce:'111'}]],
        ['delete',['222','333']],
    ]);
    const rest=[];
    const discord=async(path,options)=>{
        rest.push([path,options]);
        if(options?.method==='POST') return {json:()=>({id:'444',nonce:'111'})};
        return {json:()=>[]};
    };
    await runBetterDelete({},discord,'222','111','secret');
    assert.deepEqual(rest.map(row=>[row[0],row[1]?.method]),[
        ['/channels/222/messages/111','DELETE'],
        ['/channels/222/messages','POST'],
        ['/channels/222/messages/444','DELETE'],
    ]);
    assert.equal(JSON.parse(rest[1][1].body).nonce,'111');
    assert.equal(JSON.parse(rest[1][1].body).content,'secret');
    const nonceHits=[];
    await runBetterDelete({
        deleteMessage:async(...args)=>nonceHits.push(['delete',args]),
        _sendMessage:async()=>({id:'111',nonce:'111'}),
    },async(path,options)=>{
        nonceHits.push(['rest',path,options?.method||'GET']);
        if(!options?.method) return {json:()=>[{id:'111',nonce:'111'},{id:'555',nonce:'111'}]};
        return {json:()=>[]};
    },'222','111','secret');
    assert.deepEqual(nonceHits.filter(row=>row[0]==='delete'),[
        ['delete',['222','111']],
        ['delete',['222','555']],
    ]);
    const stored=[];
    await runBetterDelete({
        deleteMessage:async(...args)=>stored.push(args),
        _sendMessage:async()=>undefined,
    },async()=>{throw new Error('REST should not run');},'222','111','secret',()=>({_array:[{id:'111',nonce:'111'},{id:'666',nonce:'111'}]}));
    assert.deepEqual(stored,[['222','111'],['222','666']]);
    const menuCalls=[];
    const api={
        deleteMessage:async(...args)=>menuCalls.push(['delete',args]),
        _sendMessage:async(...args)=>{menuCalls.push(['send',args]);return {id:'333333333333333333'};},
        getToken(){throw new Error('Must not read token');},
    };
    const {r,toasts}=await harness(factory.defaults,[
        api,
        {storeName:'UserStore',getCurrentUser:()=>({id:'me'})},
        {openLazy(pending){return pending;},hideActionSheet(){}},
    ]);
    assert.equal(isOwnMessage(r,{id:'111',channel_id:'222',author:{id:'me'}}),true);
    assert.equal(isOwnMessage(r,{id:'111',channel_id:'222',author:{id:'other'}}),false);
    const plugin=factory(r);plugin.start();
    let view;await Renderer.act(async()=>{view=Renderer.create(React.createElement(plugin.Settings));});
    assert.equal(view.root.findByType('Switch').props.accessibilityLabel,'Silent Delete');
    assert.equal(view.root.findByType('RNInput').props.value,'redacted eh');
    await Renderer.act(async()=>view.root.findByType('RNInput').props.onChangeText('gone'));
    assert.equal(r.store.replacement,'gone');
    const sheets=r.find('openLazy','hideActionSheet');
    const message={id:'111111111111111111',channel_id:'222222222222222222',author:{id:'me'}};
    const pending=sheets.openLazy(Promise.resolve({default(){return tree;}}),'MessageLongPressActionSheet',{message});
    const wrapped=await pending;
    const rendered=wrapped.default({message});
    const better=labels(rendered).includes('Silent Delete Message');
    assert.equal(better,true);
    const press=node=>{
        if(!node)return null;
        if(Array.isArray(node)){for(const child of node){const found=press(child);if(found)return found;}return null;}
        if(node.props?.label==='Silent Delete Message')return node.props.onPress;
        return press(node.props?.children);
    };
    await press(rendered)();
    for(let i=0;i<40 && menuCalls.filter(row=>row[0]==='delete').length<2;i++) await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(toasts.length,0);
    assert.deepEqual(menuCalls,[
        ['delete',['222222222222222222','111111111111111111']],
        ['send',['222222222222222222',{content:'gone',tts:false,invalidEmojis:[],validNonShortcutEmojis:[]},{nonce:'111111111111111111'}]],
        ['delete',['222222222222222222','333333333333333333']],
    ]);
    await Renderer.act(async()=>view.unmount());
    await r.dispose();
});

test('GifRoulette and MoreCommands coexist with distinct SDK command names',async()=>{
    const {default:gifs}=await import('../src/plugins/gif-roulette.js');const {default:more}=await import('../src/plugins/more-commands.js');
    const fixture=await harness({},[{getFavoriteGIFs:()=>['https://example.com/favorite.gif']}]);
    gifs(fixture.r).start();more(fixture.r).start();
    assert(fixture.commands.has('gifroulette'));assert(fixture.commands.has('more-gifroulette'));
    assert.deepEqual(await fixture.commands.get('gifroulette').execute([],{channel:{id:'ch'}}),{content:'https://example.com/favorite.gif'});
    assert.deepEqual(await fixture.commands.get('more-gifroulette').execute([],{channel:{id:'ch'}}),{content:'https://example.com/favorite.gif'});
    await fixture.r.dispose();
});

test('Temp Delete hides any message on this device until the plugin starts again',async()=>{
    const {default:factory,placeTempDelete}=await import('../src/plugins/temp-delete.js');
    function Row(props){return React.createElement('Text',null,props.label);}
    Row.displayName='ActionSheetRow';
    const nativeDelete=()=>{deleted++;};
    let deleted=0;
    const tree=React.createElement('Sheet',null,
        React.createElement('Group',null,
            React.createElement(Row,{key:'edit',label:'Edit Message',onPress(){}}),
            React.createElement(Row,{key:'reply',label:'Reply',onPress(){}}),
            React.createElement(Row,{key:'forward',label:'Forward',onPress(){}})),
        React.createElement('Group',null,
            React.createElement(Row,{key:'copy',label:'Copy Text',onPress(){}}),
            React.createElement(Row,{key:'pin',label:'Pin Message',onPress(){}})),
        React.createElement('Group',null,React.createElement(Row,{key:'delete',label:'Delete Message',onPress:nativeDelete})));
    const labels=node=>{
        const found=[];
        const walk=value=>{
            if(!value)return;
            if(Array.isArray(value)){value.forEach(walk);return;}
            if(value.props?.label)found.push(value.props.label);
            if(value.props?.children)walk(value.props.children);
        };
        walk(node);
        return found;
    };
    const moved=placeTempDelete(React,tree,()=>{});
    assert.deepEqual(labels(moved.props.children[0]),['Edit Message','Reply','Forward']);
    assert.deepEqual(labels(moved.props.children[1]),['Copy Text','Pin Message']);
    assert.deepEqual(labels(moved.props.children[2]),['Delete Message','Temp Delete']);
    const tempRow=(()=>{
        let found=null;
        const walk=value=>{
            if(!value||found)return;
            if(Array.isArray(value)){value.forEach(walk);return;}
            if(value.props?.label==='Temp Delete')found=value;
            else if(value.props?.children)walk(value.props.children);
        };
        walk(moved);
        return found;
    })();
    assert.equal(tempRow.props.variant,'danger');
    assert.equal(tempRow.props.destructive,true);
    assert.equal(tempRow.props.icon.displayName,'ClockIcon');
    assert.equal(tempRow.props.onPress===moved.props.children[2].props.children[0].props.onPress,false);
    const again=placeTempDelete(React,moved,()=>{});
    assert.deepEqual(labels(again),labels(moved));
    const otherTree=React.createElement('Sheet',null,
        React.createElement('Group',null,
            React.createElement(Row,{key:'reply',label:'Reply',onPress(){}}),
            React.createElement(Row,{key:'forward',label:'Forward',onPress(){}})),
        React.createElement('Group',null,React.createElement(Row,{key:'copy',label:'Copy Text',onPress(){}})));
    const other=placeTempDelete(React,otherTree,()=>{});
    assert.deepEqual(labels(other.props.children[0]),['Reply','Forward','Temp Delete']);
    assert.deepEqual(labels(other.props.children[1]),['Copy Text']);
    const besideSilent=React.createElement('Group',null,
        React.createElement(Row,{key:'edit',label:'Edit Message',onPress(){}}),
        React.createElement(Row,{key:'delete',label:'Delete Message',onPress(){}}),
        React.createElement(Row,{key:'silent',label:'Silent Delete Message',onPress(){}}));
    const underDelete=placeTempDelete(React,besideSilent,()=>{});
    assert.deepEqual(labels(underDelete),['Edit Message','Delete Message','Temp Delete','Silent Delete Message']);
    const message={id:'10',channel_id:'20',author:{id:'someone-else'},content:'hello'};
    const bucket={_array:[message,{id:'11',channel_id:'20',author:{id:'me'},content:'stay'}]};
    let emitted=0;
    const store={storeName:'MessageStore',getMessages:()=>bucket,getMessage:(channel,id)=>bucket._array.find(item=>item.id===id&&item.channel_id===channel),emitChange(){emitted++;}};
    let closed=0;
    const sheets={openLazy(pending,key){this.seen=pending;this.key=key;return undefined;},hideActionSheet(){closed++;}};
    const api={deleteMessage(){deleted++;},getToken(){throw new Error('Must not read token');}};
    const native={updateRows(id,value){this.last=value;}};
    const {r}=await harness({},[store,sheets,api]);
    r.RN.NativeModules.Chat=native;
    const plugin=factory(r);
    plugin.start();
    let view;await Renderer.act(async()=>{view=Renderer.create(React.createElement(plugin.Settings));});
    assert.match(JSON.stringify(view.toJSON()),/comes back the next time Discord starts/);
    await Renderer.act(async()=>view.unmount());
    const returned=sheets.openLazy(Promise.resolve({default(){return tree;}}),'MessageLongPressActionSheet',{message});
    assert.equal(returned,undefined);
    assert.equal(sheets.key,'MessageLongPressActionSheet');
    const wrapped=await sheets.seen;
    const rendered=wrapped.default({message});
    assert.deepEqual(labels(rendered.props.children[2]),['Delete Message','Temp Delete']);
    const press=node=>{
        if(!node)return null;
        if(Array.isArray(node)){for(const child of node){const found=press(child);if(found)return found;}return null;}
        if(node.props?.label==='Temp Delete')return node.props.onPress;
        return press(node.props?.children);
    };
    const dispatched=[];
    r.common.FluxDispatcher.dispatch=event=>dispatched.push(event);
    const rows=[{message},{id:'row',message:{id:'11',content:'stay',author:{id:'me'}}}];
    native.updateRows('chat',rows);
    press(rendered)();
    await tick();
    assert.equal(closed,1);
    assert.equal(deleted,0);
    assert.equal(emitted,1);
    assert.equal(dispatched[0].type,'MESSAGE_DELETE');
    assert.equal(dispatched[0].id,'10');
    assert.equal(dispatched[0].channelId,'20');
    assert.equal(dispatched[0].mlDeleted,true);
    assert.equal(native.last.some(row=>row.message?.id==='10'),false);
    assert.deepEqual(bucket._array.map(item=>item.id),['11']);
    assert.equal(store.getMessage('20','10'),undefined);
    assert.equal(store.getMessages('20')._array.some(item=>item.id==='10'),false);
    assert.equal(JSON.stringify(r.store).includes('10'),false);
    assert.equal(React.createElement('Message',{message}),false);
    assert.equal(React.createElement('Channel',{id:'10',name:'general'}).type,'Channel');
    function ChatScreen(){return React.createElement('View',{testID:'chat'},React.createElement('Message',{message}));}
    let screen;await Renderer.act(async()=>{screen=Renderer.create(React.createElement(ChatScreen));});
    assert.equal(screen.toJSON().props.testID,'chat');
    assert.equal(screen.toJSON().children,null);
    await Renderer.act(async()=>screen.unmount());
    native.updateRows('chat',rows);
    assert.equal(native.last.length,1);
    assert.equal(native.last[0].message.id,'11');
    await r.dispose();
    bucket._array.unshift(message);
    const next=await harness({},[store,sheets,api]);
    factory(next.r).start();
    assert.equal(store.getMessage('20','10').content,'hello');
    assert.equal(React.createElement('Message',{message}).type,'Message');
    await next.r.dispose();
});

test('Temp Delete start does not enumerate React Native exports',async()=>{
    const {default:factory,ClockIcon}=await import('../src/plugins/temp-delete.js');
    function Svg(){return null;}
    function Circle(){return null;}
    function Path(){return null;}
    const {r}=await harness({},[{Svg,Circle,Path}]);
    Object.defineProperty(r.RN,'PushNotificationIOS',{enumerable:true,get(){throw new Error('`new NativeEventEmitter()` requires a non-null argument.');}});
    assert.throws(()=>{ ({...r.RN}); }, /NativeEventEmitter/);
    assert.doesNotThrow(()=>factory(r).start());
    assert.equal(ClockIcon.RN.Svg,Svg);
    assert.equal(ClockIcon.RN.Circle,Circle);
    assert.equal(ClockIcon.RN.Path,Path);
    assert.equal(Object.hasOwn(ClockIcon.RN,'PushNotificationIOS'),false);
    assert.equal(ClockIcon({color:'#F23F43',size:24}).type,Svg);
    await r.dispose();
});

test('Channel Spoilers covers images, GIFs, and videos only in listed channels',async()=>{
    const {default:factory,isVisualMedia,channelSnowflake,spoilImageLinks}=await import('../src/plugins/channel-spoilers.js');
    for(const name of ['a.png','a.jpg','a.jpeg','a.gif','a.webp','a.mp4','a.mov','a.webm']) assert.equal(isVisualMedia({filename:name}),true,name);
    assert.equal(isVisualMedia({content_type:'image/gif'} ),true);
    assert.equal(isVisualMedia({contentType:'video/mp4'} ),true);
    assert.equal(isVisualMedia({type:'gif',url:'https://cdn.example/anim'}),true);
    assert.equal(isVisualMedia({type:'image',url:'https://cdn.example/pic',width:12}),true);
    assert.equal(isVisualMedia({type:'gifv'}),true);
    assert.equal(isVisualMedia({filename:'notes.txt',content_type:'text/plain'}),false);
    assert.equal(spoilImageLinks('see https://cdn.example/cat.png please'),'see ||https://cdn.example/cat.png|| please');
    assert.equal(spoilImageLinks('clip https://cdn.example/clip.mp4'),'clip https://cdn.example/clip.mp4');
    assert.equal(spoilImageLinks('||https://cdn.example/cat.png||'),'||https://cdn.example/cat.png||');
    assert.equal(spoilImageLinks('https://tenor.com/view/cat'),'||https://tenor.com/view/cat||');
    assert.equal(spoilImageLinks('https://media.tenor.com/abc/cat.mp4'),'||https://media.tenor.com/abc/cat.mp4||');
    assert.equal(spoilImageLinks('https://media.discordapp.net/external/x/https/media.tenor.com/abc/cat.mp4'),'||https://media.discordapp.net/external/x/https/media.tenor.com/abc/cat.mp4||');
    const signed=spoilImageLinks('look https://cdn.example/cat.png?ex=1&hm=2 please');
    assert.equal(signed,'look ||https://cdn.example/cat.png?ex=1&hm=2|| please');
    assert.equal(spoilImageLinks(signed),signed);
    assert.equal(spoilImageLinks('||||https://tenor.com/view/cat||||'),'||https://tenor.com/view/cat||');
    assert.equal(spoilImageLinks('||||||||https://media.tenor.com/abc/cat.mp4||||||||'),'||https://media.tenor.com/abc/cat.mp4||');
    assert.equal(spoilImageLinks('https://cdn.example/cat.png.'), '||https://cdn.example/cat.png||.');
    assert.equal(channelSnowflake('12345678901234567'),'12345678901234567');
    assert.equal(channelSnowflake('1234'),'');
    const channel='123456789012345678';
    const other='223456789012345678';
    const native={updateRows(id,rows){this.last=rows;}};
    const {r}=await harness({...factory.defaults});
    r.RN.NativeModules.DCDChat=native;
    const plugin=factory(r);
    plugin.start();
    let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(plugin.Settings));});
    const field=()=>tree.root.findByType('RNInput');
    const add=()=>tree.root.findByProps({accessibilityLabel:'Add'});
    const typeAndAdd=async value=>{
        await Renderer.act(async()=>{field().props.onChangeText(value);});
        await Renderer.act(async()=>{add().props.onPress();});
    };
    await typeAndAdd('nope');
    assert.match(JSON.stringify(tree.toJSON()),/No channels yet/);
    assert.deepEqual(r.store.channels,[]);
    await typeAndAdd(channel);
    assert.deepEqual(r.store.channels,[channel]);
    await typeAndAdd(channel);
    assert.deepEqual(r.store.channels,[channel]);
    await typeAndAdd('  '+other+'  ');
    assert.deepEqual(r.store.channels,[channel,other]);
    await Renderer.act(async()=>tree.root.findByProps({accessibilityLabel:'Remove '+other}).props.onPress());
    assert.deepEqual(r.store.channels,[channel]);
    await Renderer.act(async()=>tree.unmount());
    function Picture(props){
        return React.createElement('MessageImage',{attachment:props.attachment,message:props.message});
    }
    const gif={id:'gif',filename:'cat.gif',content_type:'image/gif',url:'https://cdn.example/cat.gif'};
    const video={id:'vid',filename:'clip.mp4',content_type:'video/mp4'};
    const listedMessage={id:'m1',channel_id:channel,author:{id:'u'},content:'pic',attachments:[gif]};
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(Picture,{attachment:gif,message:listedMessage}));});
    const cover=tree.root.findByProps({testID:'mime-channel-spoiler'});
    assert.equal(cover.props.accessibilityLabel,'Spoiler');
    await Renderer.act(async()=>cover.props.onPress());
    assert.equal(tree.root.findAllByProps({testID:'mime-channel-spoiler'}).length,0);
    assert.equal(tree.root.findByType('MessageImage').props.attachment.filename,'cat.gif');
    await Renderer.act(async()=>tree.unmount());
    function Album(props){
        return React.createElement('View',null,
            React.createElement('MessageVideo',{attachment:video,message:props.message}),
            React.createElement('Avatar',{user:{id:'u'},size:32,source:{uri:'https://cdn.example/a.png'}}));
    }
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(Album,{message:listedMessage}));});
    assert.equal(tree.root.findAllByProps({testID:'mime-channel-spoiler'}).length,1);
    assert.equal(tree.root.findByType('Avatar').props.size,32);
    await Renderer.act(async()=>tree.unmount());
    function PlainImage(props){
        return React.createElement('Image',{source:{uri:'https://cdn.example/plain.png'},style:{width:220,height:180},message:props.message});
    }
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(PlainImage,{message:listedMessage}));});
    assert.equal(tree.root.findAllByProps({testID:'mime-channel-spoiler'}).length,1);
    await Renderer.act(async()=>tree.unmount());
    await Renderer.act(async()=>{tree=Renderer.create(React.createElement(Picture,{attachment:gif,message:{...listedMessage,channel_id:other}}));});
    assert.equal(tree.root.findAllByProps({testID:'mime-channel-spoiler'}).length,0);
    assert.equal(tree.root.findByType('MessageImage').props.attachment.id,'gif');
    await Renderer.act(async()=>tree.unmount());
    native.updateRows('chat',[
        {channelId:channel,filename:'a.gif',content_type:'image/gif'},
        {channelId:other,filename:'b.png',content_type:'image/png'},
        {channelId:channel,content:'hi',attachments:[{filename:'c.webp',content_type:'image/webp'},{filename:'d.txt',content_type:'text/plain'}]},
        {channelId:channel,avatar:true,filename:'e.png',content_type:'image/png'},
        {channelId:channel,embeds:[{type:'gifv',video:{url:'https://cdn.example/clip.mp4',width:120,height:80}}]},
    ]);
    assert.equal(native.last[0].filename,'SPOILER_a.gif');
    assert.equal(native.last[0].spoiler,'true');
    assert.equal(typeof native.last[0].spoiler,'string');
    assert.equal(native.last[0].flags & 8,8);
    assert.equal(native.last[0].is_spoiler,true);
    assert.equal(native.last[0].obscure,undefined);
    assert.equal(native.last[0].hidden,undefined);
    assert.equal(native.last[1].spoiler,undefined);
    assert.equal(native.last[1].flags,undefined);
    assert.equal(native.last[2].attachments[0].filename,'SPOILER_c.webp');
    assert.equal(native.last[2].attachments[0].spoiler,'true');
    assert.equal(typeof native.last[2].attachments[0].spoiler,'string');
    assert.equal(native.last[2].attachments[0].flags & 8,8);
    assert.equal(native.last[2].attachments[1].spoiler,undefined);
    assert.equal(native.last[2].content,'hi');
    assert.equal(native.last[3].spoiler,undefined);
    assert.equal(native.last[3].filename,'e.png');
    assert.equal(native.last[4].embeds.length,0);
    const gifEmbed=native.last[4].attachments[0];
    assert.equal(gifEmbed.filename,'SPOILER_gif.mp4');
    assert.equal(gifEmbed.spoiler,'true');
    assert.equal(typeof gifEmbed.spoiler,'string');
    assert.equal(gifEmbed.flags & 8,8);
    assert.equal(gifEmbed.is_spoiler,true);
    assert.equal(gifEmbed.isSpoiler,true);
    assert.equal(gifEmbed.url,'https://cdn.example/clip.mp4');
    assert.equal(gifEmbed.proxy_url,'https://cdn.example/clip.mp4');
    assert.equal(gifEmbed.obscure,undefined);
    assert.equal(gifEmbed.hidden,undefined);
    native.updateRows('chat',[
        {channelId:channel,content:'look https://cdn.example/cat.png please',embeds:[{type:'image',url:'https://cdn.example/cat.png',image:{url:'https://cdn.example/cat.png',proxy_url:'https://media.example/cat.png',width:40,height:40}}]},
        {channelId:channel,attachments:[{id:'gif1',filename:'dance.gif',content_type:'image/gif',url:'https://cdn.example/dance.gif?ex=1&hm=2',proxy_url:'https://media.example/dance.gif?ex=1&hm=2',spoiler:''}]},
        {channelId:channel,components:[{type:12,items:[{spoiler:false,media:{url:'https://cdn.example/a.png',proxy_url:'https://media.example/a.png',width:20,height:20}}]}]},
    ]);
    const linked=native.last[0];
    assert.equal(linked.content,'look ||https://cdn.example/cat.png|| please');
    assert.equal(linked.embeds[0].image.spoiler,'true');
    assert.equal(typeof linked.embeds[0].image.spoiler,'string');
    assert.equal(linked.embeds[0].image.is_spoiler,true);
    assert.equal(linked.embeds[0].image.flags & 8,8);
    assert.equal(linked.embeds[0].image.url,'https://cdn.example/cat.png');
    assert.equal(linked.embeds[0].image.proxy_url,'https://media.example/cat.png');
    const gifFile=native.last[1].attachments[0];
    assert.equal(gifFile.filename,'SPOILER_dance.gif');
    assert.equal(gifFile.spoiler,'true');
    assert.equal(typeof gifFile.spoiler,'string');
    assert.equal(gifFile.is_spoiler,true);
    assert.equal(gifFile.isSpoiler,true);
    assert.equal(gifFile.flags & 8,8);
    assert.equal(gifFile.url,'https://cdn.example/dance.gif?ex=1&hm=2');
    assert.equal(gifFile.proxy_url,'https://media.example/dance.gif?ex=1&hm=2');
    assert.equal(gifFile.obscure,undefined);
    const gallery=native.last[2].components[0].items[0];
    assert.equal(gallery.spoiler,true);
    assert.equal(gallery.media.spoiler,'true');
    assert.equal(typeof gallery.media.spoiler,'string');
    assert.equal(gallery.media.is_spoiler,true);
    assert.equal(gallery.media.url,'https://cdn.example/a.png');
    assert.equal(gallery.media.proxy_url,'https://media.example/a.png');
    native.updateRows('chat',[{
        id:'m-gif',
        channelId:channel,
        content:'https://tenor.com/view/cat-gif-1',
        embeds:[{
            type:'gifv',
            url:'https://tenor.com/view/cat-gif-1',
            provider:{name:'Tenor'},
            thumbnail:{url:'https://media.tenor.com/abc/cat.png',width:120,height:80},
            video:{url:'https://media.tenor.com/abc/cat.mp4',proxy_url:'https://media.discordapp.net/external/x/cat.mp4',width:120,height:80},
        }],
    }]);
    const linkedGif=native.last[0];
    assert.equal(linkedGif.content,'||https://tenor.com/view/cat-gif-1||');
    assert.equal(linkedGif.embeds.length,0);
    assert.equal(linkedGif.attachments[0].filename,'SPOILER_gif.mp4');
    assert.equal(linkedGif.attachments[0].spoiler,'true');
    assert.equal(typeof linkedGif.attachments[0].spoiler,'string');
    assert.equal(linkedGif.attachments[0].content_type,'video/mp4');
    assert.equal(linkedGif.attachments[0].flags & 8,8);
    assert.equal(linkedGif.attachments[0].url,'https://media.tenor.com/abc/cat.mp4');
    assert.equal(linkedGif.attachments[0].proxy_url,'https://media.discordapp.net/external/x/cat.mp4');
    assert.equal(linkedGif.attachments[0].obscure,undefined);
    assert.equal(linkedGif.attachments[0].isSpoiler,true);
    native.updateRows('chat',[{
        channelId:channel,
        referencedMessage:{message:{
            attachments:[{id:'note',filename:'note.txt',content_type:'text/plain',url:'https://cdn.example/note.txt'}],
            embeds:[{type:'gifv',url:'https://tenor.com/view/reply',video:{url:'https://media.tenor.com/reply/a.mp4',proxy_url:'https://media.example/reply.mp4',width:12,height:12}}],
        }},
    }]);
    const reply=native.last[0].referencedMessage.message;
    assert.equal(reply.attachments[0].isSpoiler,false);
    assert.equal(reply.attachments[0].spoiler,undefined);
    const replyGif=reply.attachments[1];
    assert.equal(replyGif.isSpoiler,true);
    assert.equal(replyGif.spoiler,'true');
    assert.equal(typeof replyGif.spoiler,'string');
    assert.equal(replyGif.url,'https://media.tenor.com/reply/a.mp4');
    assert.equal(replyGif.proxy_url,'https://media.example/reply.mp4');
    native.updateRows('chat',[{
        channelId:channel,
        message:{referencedMessage:{message:{attachments:[{id:'only'}]}}},
    }]);
    const partial=native.last[0].message.referencedMessage.message.attachments[0];
    assert.equal(partial.isSpoiler,false);
    assert.equal(partial.spoiler,undefined);
    const packed={attachments:[{id:'packed',url:'https://cdn.example/y'}]};
    native.updateRows('chat',[{channelId:channel,referencedMessage:{message:JSON.stringify(packed)}}]);
    assert.equal(JSON.parse(native.last[0].referencedMessage.message).attachments[0].isSpoiler,false);
    const stacked='||||https://cdn.example/cat.png?ex=1&hm=2||||';
    native.updateRows('chat',[{channelId:channel,content:stacked}]);
    assert.equal(native.last[0].content,'||https://cdn.example/cat.png?ex=1&hm=2||');
    native.updateRows('chat',JSON.parse(JSON.stringify(native.last)));
    assert.equal(native.last[0].content,'||https://cdn.example/cat.png?ex=1&hm=2||');
    await r.dispose();
});
