const {test}=require('node:test');
const assert=require('node:assert/strict');
const {React:R,Renderer:T,client,load}=require('./helpers.cjs');
const {act}=T;
const delay=()=>new Promise(r=>setTimeout(r,130));

test('live console groups repeats, handles circular objects, filters, searches and clears',async()=>{
    const copied=[];const mod=client([{setString:s=>copied.push(s),getString:()=>''}]);
    const {plugin,context}=load('DebugConsole',mod);
    plugin.start();let ui;act(()=>{ui=T.create(R.createElement(plugin.SettingsComponent));});
    const circular={message:'object'};circular.self=circular;
    await act(async()=>{context.console.warn('same warning');context.console.warn('same warning');context.console.error(circular);await delay();});
    const feed=()=>ui.root.findByType('FlatList').props;
    assert.equal(feed().data.find(x=>x.message==='same warning').count,2);
    assert.match(feed().data[0].message,/Circular/);
    function press(label){act(()=>ui.root.findAllByType('Pressable').find(x=>x.props.accessibilityLabel===label).props.onPress());}
    press('Warnings & errors');assert.equal(feed().data.length,2);
    act(()=>ui.root.findByType('TextInput').props.onChangeText('same'));
    assert.equal(feed().data.length,1);
    press('Copy logs');assert.match(copied[0],/WARN ×2/);
    press('Clear console');await act(delay);
    assert.equal(context.lines.length,0);assert.equal(feed().data.length,0);
    act(()=>ui.root.findByType('TextInput').props.onChangeText(''));
    await act(async()=>{context.console.error('new error');await delay();});
    assert.equal(feed().data.length,1);
    act(()=>ui.unmount());plugin.stop();assert.equal(context.listeners.length,0);
});

test('console commands have unique IDs and lifecycle restores hooks/listeners',()=>{
    const events=new Map();const mod=client();
    const {plugin,context}=load('DebugConsole',mod,{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}});
    const orig=context.console.log;
    plugin.start();plugin.start();
    assert.deepEqual(mod.registered.map(c=>c.id),['-920000','-920001']);
    assert.equal(events.size,2);
    context.console.error('x');mod.registered[1].execute();assert.equal(context.lines.length,0);
    plugin.stop();assert.equal(context.console.log,orig);assert.equal(events.size,0);assert.equal(mod.registered.length,0);
});
