const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {client,load}=require('./helpers.cjs');

test('registers only gifroulette, resolves map keys, and sends once using REST',async()=>{
    const sent=[];const local=[];
    const builtins={getBuiltInCommands:()=>[{name:'gifroulette',execute:()=>{throw new Error('stale handler');}},{name:'shrug'}]};
    const original=builtins.getBuiltInCommands;
    const mod=client([builtins,{getToken:()=> 'test-only-token'},
        {getFavoriteGIFs:()=>({favoriteGifs:{gifs:{'https://tenor.com/view/test-gif':{src:'https://images-ext-1.discordapp.net/preview.webp'}}}})},
        {sendBotMessage:(id,msg)=>local.push({id,msg})},
        {fromTimestamp:()=> 'test-nonce'}]);
    const {plugin}=load('GifRoulette',mod,{fetch:async(url,opts)=>{sent.push({url,opts});return {status:200};}});
    plugin.start();plugin.start();
    assert.deepEqual(mod.registered.map(c=>c.name),['gifroulette']);
    assert.equal(mod.registered[0].id,'-910000');
    assert.equal(mod.registered[0].inputType,0);
    assert.ok(Array.isArray(mod.registered[0].options));
    const picker=builtins.getBuiltInCommands();assert.equal(picker.filter(c=>c.name==='gifroulette').length,1);
    await picker.find(c=>c.name==='gifroulette').execute([],{channel_id:'123'});
    assert.equal(sent.length,1);assert.equal(local.length,0);
    assert.deepEqual(JSON.parse(sent[0].opts.body),{content:'https://tenor.com/view/test-gif',nonce:'test-nonce'});
    plugin.stop();assert.equal(mod.registered.length,0);assert.equal(builtins.getBuiltInCommands,original);
    assert.equal(fs.existsSync(path.join(__dirname,'../MoreCommands')),false);
});

test('empty favorites produce a local explanation without a channel send',async()=>{
    const local=[];const mod=client([{sendBotMessage:(id,msg)=>local.push(msg)}]);
    const {plugin}=load('GifRoulette',mod,{fetch:()=>{throw new Error('unexpected network');}});
    plugin.start();await mod.registered[0].execute([],{channelId:'123'});
    assert.match(local[0].content,/No favorite GIFs/);plugin.stop();
});
