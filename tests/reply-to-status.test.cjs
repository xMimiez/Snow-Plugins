const {test}=require('node:test');
const assert=require('node:assert/strict');
const {React:R,Renderer:T,client,load}=require('./helpers.cjs');
const {act}=T;

function fixture() {
    let alerts=0;
    const mod=client([
        {getCurrentUser:()=>({id:'me'}),getUser:id=>({id,username:'Mime'})},
        {openAlert(){alerts++;},dismissAlert(){alerts++;}}
    ]);
    const app=load('ReplyToStatus',mod);
    return {...app,mod,alerts:()=>alerts};
}
function buttons(root) {return root.findAll(n=>n.type==='Pressable' && n.props.accessibilityLabel==='Reply to Status');}

test('nested profile gates keep one button across independent rerenders and remounts',()=>{
    const {plugin,context}=fixture();
    const status={text:'hello'};
    let update;
    function Child() {
        const [n,set]=R.useState(0);update=set;
        return plugin.afterProfileRender([{userId:'friend',customStatus:status}],R.createElement('View',null,R.createElement('Text',null,'child '+n)));
    }
    function Parent() {return plugin.afterProfileRender([{userId:'friend',customStatus:status}],R.createElement(Child));}
    let ui;
    act(()=>{ui=T.create(R.createElement(Parent));});
    assert.equal(buttons(ui.root).length,1);
    act(()=>update(1));assert.equal(buttons(ui.root).length,1);
    act(()=>ui.update(R.createElement(Parent)));assert.equal(buttons(ui.root).length,1);
    act(()=>ui.unmount());assert.equal(context.overlayListeners.length,0);
    act(()=>{ui=T.create(R.createElement(Parent));});assert.equal(buttons(ui.root).length,1);
    act(()=>ui.unmount());
});

test('composer mounts visibly in profile, opens once, cancels, and cleans up',()=>{
    const {plugin,context,alerts}=fixture();
    let ui;
    act(()=>{ui=T.create(plugin.afterProfileRender([{userId:'friend',customStatus:{text:'hello'}}],R.createElement('View',null,R.createElement('Text',null,'hello'))));});
    act(()=>buttons(ui.root)[0].props.onPress());
    assert.equal(ui.root.findAllByType('TextInput').length,1);
    assert.equal(ui.root.findAllByType('Modal').length,0);
    assert.equal(alerts(),0);
    act(()=>plugin.openReplyWindow('friend',{text:'hello'}));
    assert.equal(ui.root.findAllByType('TextInput').length,1);
    const cancel=ui.root.findAllByType('Pressable').find(n=>n.findAllByType('Text').some(t=>t.children.includes('Cancel')));
    act(()=>cancel.props.onPress());
    assert.equal(ui.root.findAllByType('TextInput').length,0);
    assert.equal(context.overlay.open,false);
    act(()=>buttons(ui.root)[0].props.onPress());
    act(()=>ui.unmount());
    assert.equal(context.overlay.open,false);
    assert.equal(context.overlayListeners.length,0);
});

test('own profile and missing status have no reply control',()=>{
    const {plugin}=fixture();
    for(const props of [{userId:'me',customStatus:{text:'mine'}},{userId:'friend'}]) {
        let ui;act(()=>{ui=T.create(plugin.afterProfileRender([props],R.createElement('View')));});
        assert.equal(buttons(ui.root).length,0);act(()=>ui.unmount());
    }
});

test('a metadata-free profile container lets its status-bearing child own the controls',()=>{
    const {plugin}=fixture();
    function Inner(){return plugin.afterProfileRender([{userId:'friend',customStatus:{text:'hello'}}],R.createElement('View'));}
    let ui;
    act(()=>{ui=T.create(plugin.afterProfileRender([{}],R.createElement(Inner)));});
    assert.equal(buttons(ui.root).length,1);
    act(()=>ui.unmount());
});
