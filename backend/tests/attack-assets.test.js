const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const front=path.resolve(__dirname,'../../frontend');
const html=fs.readFileSync(path.join(front,'game.html'),'utf8');
const script=name=>fs.readFileSync(path.join(front,'scripts',name+'.js'),'utf8');

function setup(){
  const sounds=[], elements=new Map(), components={};
  for(const match of html.matchAll(/<audio\s+id="([^"]+)"\s+src="([^"]+)"/g)){
    const [,id,src]=match;
    elements.set(id,{src,volume:1,currentTime:99,play(){sounds.push({id,src,volume:this.volume,time:this.currentTime});return Promise.resolve();}});
  }
  elements.set('enemy',{components:{'enemy-ai':{reactToHit(){},resumeCombat(){}}}});
  const sandbox={console,performance:{now:()=>1000},localStorage:{getItem:()=>"[]"},
    document:{getElementById:id=>elements.get(id)||null,addEventListener(){},querySelector:()=>null},
    updateHUD(){},getPromptLabel:a=>a,AFRAME:{registerComponent:(name,def)=>{components[name]=def;}},addEventListener(){},setTimeout:()=>1,clearTimeout(){}};
  sandbox.window=sandbox;vm.createContext(sandbox);
  for(const name of ['state','gameplay','components'])vm.runInContext(script(name),sandbox);
  vm.runInContext('game.running=true; game.phase=3; game.enemyHitsNeeded=99; game.lives=99; setSfxVolume(.5);',sandbox);
  // HUD rendering and animations are unrelated to the asset selection.
  vm.runInContext('setPrompt=()=>{};setPromptState=()=>{};setResult=()=>{};updateHUD=()=>{};flashEnemy=()=>{};',sandbox);
  return {sandbox,sounds,elements,components};
}

test('player keyboard and camera attacks play the original headbutt file, at configured volume, never punch-swing',()=>{
  const {sandbox,sounds}=setup();
  for(const source of ['teclado','visão corporal']){
    sandbox.openPrompt('attack');
    assert.equal(sandbox.dispatchGameAction('attack',source),true);
  }
  assert.equal(sounds.length,2);
  for(const sound of sounds){
    assert.equal(sound.id,'player-attack');
    assert.match(sound.src,/^\/sounds\/headbutt\.mp3\?v=/);
    assert.equal(sound.volume,.5);assert.equal(sound.time,0);
    assert.ok(fs.readFileSync(path.join(front,sound.src.split('?')[0])).equals(fs.readFileSync(path.join(front,'sounds/headbutt.mp3'))));
  }
  vm.runInContext('setSfxVolume(0)',sandbox);
  sandbox.openPrompt('attack');sandbox.dispatchGameAction('attack','teclado');assert.equal(sounds.length,2);
});

test('adventurer low attack opens jump and plays the actual Roll clip; high attack still requires duck',()=>{
  const {sandbox,sounds,components}=setup();
  const enemy=components['enemy-ai'], played=[];
  const receiver={...enemy,playModelClip:(clip,loop,clamp,options)=>{played.push({clip,loop,clamp,options});return true;},scheduleIdleReturn(){}};
  receiver.physicalAttack('low');
  assert.equal(sandbox.getGameInputState().expectedAction,'jump');
  assert.equal(played[0].clip,'CharacterArmature|Roll');
  assert.equal(sounds[0].id,'punch-swing');
  const glb=fs.readFileSync(path.join(front,'models/hooded-adventurer.glb'));
  const model=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  const roll=model.animations.find(a=>a.name===played[0].clip);assert.ok(roll);
  const duration=Math.max(...roll.samplers.map(s=>model.accessors[s.input].max[0]));
  assert.ok(duration/played[0].options.timeScale <= .86);
  receiver.physicalAttack('high');
  assert.equal(sandbox.getGameInputState().expectedAction,'duck');assert.equal(played[1].clip,'CharacterArmature|Kick_Right');
});

test('changed scripts and player audio have the expected cache keys',()=>{
  for(const name of ['state','ui','components']){
    assert.ok(html.includes(`/scripts/${name}.js?v=20261127-corpus-hips`));
  }
  for(const name of ['gameplay','game-pose-controller']){
    assert.ok(html.includes(`/scripts/${name}.js?v=20261127-corpus-hips`));
  }
  assert.ok(html.includes('/style.css?v=20261127-corpus-hips'));
  assert.ok(html.includes('/sounds/headbutt.mp3?v=20261127-v8'));
});

test('dwarf opens more often and cannot select more than two consecutive attacks',()=>{
  const {sandbox,components}=setup();const enemy=components['enemy-ai'];
  vm.runInContext('game.phase=2; game.customMode=false; Math.random=()=>.99;',sandbox);
  const profile=sandbox.getEnemyProfile(2);
  assert.equal(profile.patternWeights.vulnerable,.45);
  assert.equal(profile.patternWeights.low,.55);
  const chosen=[];
  const receiver={...enemy,physicalAttack:p=>chosen.push(p),vulnerableOpen:()=>chosen.push('vulnerable')};
  for(let i=0;i<9;i++) receiver.attack();
  assert.deepEqual(chosen,['low','low','vulnerable','low','low','vulnerable','low','low','vulnerable']);
  vm.runInContext('Math.random=()=>.3;',sandbox);
  receiver.attack();assert.equal(chosen.at(-1),'vulnerable');
  vm.runInContext('game.phase=3; Math.random=()=>.99;',sandbox);
  chosen.length=0;for(let i=0;i<5;i++) receiver.attack();
  assert.deepEqual(chosen,['low','low','low','low','low']);
});


test('enemy HP is a fixed HTML HUD, not a WebXR plane; only desktop pause button remains',()=>{
  assert.match(html,/<div id="enemyHpHud"[^>]*role="progressbar"/);
  assert.match(html,/<div id="enemyHpFill"/);
  assert.match(html,/<span id="enemyHpText"/);
  assert.doesNotMatch(html,/id="enemyWorldHpRoot"|id="pauseButtonVR"/);
  assert.match(html,/<button id="pauseMenuDesktopToggle"/);
  assert.match(fs.readFileSync(path.join(front,'style.css'),'utf8'),/\.enemy-hp-hud\s*\{[^}]*position: fixed;[^}]*left: 50%/);
  const elements={enemyHpFill:{style:{}},enemyHpText:{},enemyHpHud:{attrs:{},setAttribute(k,v){this.attrs[k]=v;}}};
  const sandbox={game:{enemyHitsNeeded:5,enemyHits:2},isInfinite:n=>n===Infinity,enemyHpFillEl:elements.enemyHpFill,enemyHpTextEl:elements.enemyHpText,document:{getElementById:id=>elements[id]}};
  vm.createContext(sandbox);
  const ui=script('ui');vm.runInContext(ui.slice(ui.indexOf('function updateEnemyHpBar('),ui.indexOf('function updatePlayerHpBar(')),sandbox);
  sandbox.updateEnemyHpBar();assert.equal(elements.enemyHpFill.style.width,'60%');assert.equal(elements.enemyHpText.textContent,'INIMIGO HP 3/5');
  sandbox.game.enemyHits=5;sandbox.updateEnemyHpBar();assert.equal(elements.enemyHpFill.style.width,'0%');
  sandbox.game.enemyHitsNeeded=Infinity;sandbox.updateEnemyHpBar();assert.equal(elements.enemyHpFill.style.width,'100%');assert.match(elements.enemyHpText.textContent,/∞/);
  assert.equal(elements.enemyHpHud.attrs['aria-valuetext'],'Vida infinita');
});

test('enemy animation mixer does not advance during manual pause',()=>{
  const {sandbox,components}=setup();let updates=0;
  const receiver={modelMixers:new Map([['test',{update(){updates++;}}]])};
  sandbox.openPrompt('attack');sandbox.setGamePaused(true);components['enemy-ai'].tick.call(receiver,0,16);assert.equal(updates,0);
  sandbox.setGamePaused(false);components['enemy-ai'].tick.call(receiver,16,16);assert.equal(updates,1);
});


test('enemy tick and direct attack/resume cannot bypass standby even with canAttack true',()=>{
  const {sandbox,components}=setup();const def=components['enemy-ai'];
  let variants=0, actions=0;
  const receiver={...def,canAttack:true,isDefeated:false,modelMixers:new Map(),applyVariantForPhase(){variants++;},vulnerableOpen(){actions++;},physicalAttack(){actions++;}};
  for(const state of ['game.running=false;game.awaitingEnemyStart=false;','game.running=true;game.awaitingEnemyStart=true;']){
    vm.runInContext(state,sandbox);
    def.tick.call(receiver,0,16);def.resumeCombat.call(receiver);def.attack.call(receiver);
    assert.equal(sandbox.openPrompt('attack'),false);
  }
  assert.equal(variants,0);assert.equal(actions,0);
});
