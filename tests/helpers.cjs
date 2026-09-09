const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const Renderer = require('react-test-renderer');

function client(modules = [], extra = {}) {
    const registered = [];
    const native = Object.fromEntries(['View','Text','TextInput','ScrollView','Pressable','TouchableOpacity','SafeAreaView','FlatList','Modal','KeyboardAvoidingView'].map(x => [x,x]));
    native.Platform = {OS:'ios'};
    native.Dimensions = {get:() => ({width:390,height:844})};
    native.Alert = {alert:() => { throw new Error('Unexpected native alert'); }};
    const commands = {registerCommand(cmd) {cmd.id = '-1'; registered.push(cmd); return () => {const i=registered.indexOf(cmd);if(i>=0)registered.splice(i,1);};}};
    const patcher = {after(key, obj, callback) {const orig=obj[key];function patched(...args) {return callback(args,orig.apply(this,args));}obj[key]=patched;return () => {if(obj[key]===patched)obj[key]=orig;};}};
    const metro = {
        common:{React,ReactNative:native},
        findByProps:(...keys) => modules.find(m=>m && keys.every(k=>k in m)),
        findByName:(name) => modules.find(m=>m.name===name || (m.default && m.default.name===name)),
        findByStoreName:(name) => modules.find(m=>m.storeName===name),
        find:fn => modules.find(fn)
    };
    return Object.assign({api:{commands,patcher},metro,registered,native}, extra);
}
function load(folder, mod, extra={}) {
    const source=fs.readFileSync(path.join(__dirname,'..',folder,'index.ts'),'utf8');
    const context=vm.createContext({bunny:mod,definePlugin:x=>x,console:{log(){},info(){},warn(){},error(){},debug(){}},setTimeout,clearTimeout,...extra});
    vm.runInContext(source+'\n;globalThis.result=plugin;',context,{filename:folder+'/index.ts'});
    return {plugin:context.result,context};
}
module.exports={React,Renderer,client,load};
