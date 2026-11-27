const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const scripts = path.resolve(__dirname, '../../frontend/scripts');
const gameplay = fs.readFileSync(path.join(scripts, 'gameplay.js'), 'utf8');
const ui = fs.readFileSync(path.join(scripts, 'ui.js'), 'utf8');
const pauseUI = ui.slice(ui.indexOf('function setDesktopPauseMenuVisible('), ui.indexOf('window.addEventListener("keydown"')); 
// Only replace the network/model boundary; run the real camera frame loop,
// landmark mirroring, calibration, recognition, dispatch and combat functions.
const controller = fs.readFileSync(path.join(scripts, 'game-pose-controller.js'), 'utf8')
  .replace('await import(`${base}/vision_bundle.mjs`)', 'mockVision');

function neutralPose() {
  const points = Array(33).fill(null);
  function put(i,x,y,z=0) { points[i] = {x,y,z,visibility:1}; }
  put(0,.50,.27,-.12);
  put(11,.40,.40,0); put(12,.60,.40,0);
  put(13,.37,.52,.02); put(14,.63,.52,.02);
  put(15,.40,.53,-.04); put(16,.60,.53,-.04);
  put(23,.43,.68,0); put(24,.57,.68,0);
  put(25,.43,.82,0); put(26,.57,.82,0);
  return points;
}
// A real extension: shoulder, elbow and wrist nearly collinear in 3D.
function extendArm(p, wrist) {
  const shoulder = p[wrist-4], elbow = p[wrist-2];
  Object.assign(elbow, {x:shoulder.x, y:shoulder.y+.025, z:shoulder.z-.115});
  Object.assign(p[wrist], {x:shoulder.x, y:shoulder.y+.05, z:shoulder.z-.25});
  return p;
}
function poseFor(action) {
  const p = neutralPose();
  if (action === 'attack') extendArm(p, 15);
  if (action === 'duck') for (const v of p.filter(Boolean)) v.y += .13;
  if (action === 'jump') for (const v of p.filter(Boolean)) v.y -= .09;
  if (action === 'dodgeLeft') for (const v of p.filter(Boolean)) v.x -= .06;
  if (action === 'dodgeRight') for (const v of p.filter(Boolean)) v.x += .06;
  // Test input coordinates are the preview (mirrored); simulate raw camera.
  return p.map(v => v ? {...v,x:1-v.x} : v);
}
async function setup(calibrationPose = null, {width=960,height=540,failGpu=false,initialRunning=true} = {}) {
  let now=1000, nextId=1, raf, current=poseFor(null);
  const timers = new Map(), attempts=[], animations=[], draws=[], modelOptions=[];
  const noop=()=>{};
  const ctx = new Proxy({}, {get:(_obj,key)=>(...args)=>{if (["drawImage","arc","translate","scale"].includes(key)) draws.push({key,args});},set:()=>true});
  const elements = new Map();
  function getElement(id) {
    if (!elements.has(id)) {
      const classes=new Set(), attributes=new Map(), listeners=new Map();
      elements.set(id, { id, textContent:'', checked:false, style:{}, addEventListener:(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);}, emit(type){for(const fn of listeners.get(type)||[])fn({target:this});}, getContext:()=>ctx,
        classList:{toggle:(name,force)=>{if(force) classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
        setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name) });
    }
    return elements.get(id);
  }
  const video=getElement('poseControlVideo');
  Object.assign(video,{videoWidth:width,videoHeight:height,currentTime:0,readyState:4,play:async()=>{}});
  const lifecycle={resumes:0,summaries:[],variants:[],positions:0};
  getElement('enemy').components={'enemy-ai':{data:{},reactToHit:noop,resumeCombat(){lifecycle.resumes++;this.canAttack=true;},setVariantForPhase(phase){lifecycle.variants.push(phase);this.canAttack=true;},defeat(fn){if(fn)sandbox.setCombatTimeout(fn,1450);}}};
  const game={running:initialRunning,paused:false,phaseStartTime:now,waitingInput:false,phase:3,lives:10,hits:0,misses:0,reactionTimes:[],enemyHits:0,enemyHitsNeeded:99,promptStartTime:0};
  const sandbox={
    console,game,performance:{now:()=>now}, document:{getElementById:getElement, createElement:()=>({getContext:()=>ctx}), querySelector:()=>null, addEventListener:noop},
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})}},
    requestAnimationFrame:fn=>{raf=fn;return nextId++;},cancelAnimationFrame:()=>{raf=null;},
    setTimeout:(fn,ms)=>{const id=nextId++;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    mockVision:{FilesetResolver:{forVisionTasks:async()=>({})},PoseLandmarker:{createFromOptions:async(_resolver,options)=>{
      modelOptions.push(options);
      if(failGpu && options.baseOptions.delegate==='GPU') throw new Error('test GPU unavailable');
      return {detectForVideo:source=>{
        assert.equal(source.width,512);assert.equal(source.height,512);
        const scale=Math.min(source.width/video.videoWidth,source.height/video.videoHeight);
        const dw=video.videoWidth*scale,dh=video.videoHeight*scale;
        const ox=(source.width-dw)/2,oy=(source.height-dh)/2;
        return {landmarks:current?[current.map(v=>v?{...v,x:(v.x*dw+ox)/source.width,y:(v.y*dh+oy)/source.height,z:v.z*dw/source.width}:v)]:[]};
      }};
    }}},
    ACTION_TYPES:['attack','duck','jump','dodgeLeft','dodgeRight'],
    getActiveDifficultyPhase:()=>game.phase,getEnemyProfile:()=>({key:game.phase===1?'king':'adventurer'}),
    getReactionWindow:()=>1500,getPromptLabel:a=>a, isJumpDisabled:()=>Boolean(game.jumpDisabled),isInfinite:n=>n===Infinity,
    setPrompt:noop,setPromptState:noop,setResult:noop,updateHUD:noop,flashEnemy:noop,playSfx:noop,
    recordActionAttempt:a=>attempts.push(a),animateKeyboardCamera:a=>animations.push(a),
    getEnemySpeed:()=>.1,getEnemyHitsNeeded:()=>3,getEnemyDisplayName:p=>`Inimigo ${p}`,getDifficultyLabel:p=>`Dificuldade ${p}`,
    setRoundControlsVisibility:noop,resetEnemyPosition:()=>lifecycle.positions++,renderPerformanceHistory:noop,
    summarizePhase:status=>lifecycle.summaries.push(status),beginPhaseTracking:()=>{game.phaseStartTime=now;},
    clearTimers:()=>{timers.delete(game.reactionTimeoutId);game.reactionTimeoutId=null;sandbox.clearCombatTimeout(game.nextRoundTimeoutId);game.nextRoundTimeoutId=null;}
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  if (!initialRunning) {
    for(const id of ['customModeEnabled','customLives','customLivesInfinite','customEnemyHits','customEnemyHitsInfinite','customDifficulty','customDisableJump']) sandbox[id+'El']=getElement(id);
    getElement('customLives').value='3';getElement('customEnemyHits').value='3';getElement('customDifficulty').value='2';
    const stateSource=fs.readFileSync(path.join(scripts,'state.js'),'utf8');
    vm.runInContext(stateSource.slice(stateSource.indexOf('function isInfinite('),stateSource.indexOf('function setCanvasText(')),sandbox);
  }
  vm.runInContext(gameplay,sandbox);
  vm.runInContext(pauseUI,sandbox);
  vm.runInContext(controller,sandbox);
  function advance(ms) {
    now+=ms;
    for(const [id,t] of [...timers]) if(t.at<=now && timers.has(id)) {timers.delete(id);t.fn();}
  }
  function feed(action,frames=2) {
    current=action==='missing'?null:Array.isArray(action)?action.map(v=>v?{...v,x:1-v.x}:v):poseFor(action);
    for(let i=0;i<frames;i++) {advance(33); video.currentTime+=.033; raf?.();}
  }
  assert.equal(await sandbox.__corpusVRPoseDebug.start(),true);
  feed(calibrationPose,16);
  assert.ok(sandbox.__corpusVRPoseDebug.baseline());
  assert.equal(sandbox.getGameInputState().trackingReady,true);
  return {sandbox,game,attempts,animations,feed,advance,video,getElement,draws,modelOptions,lifecycle,duplicate:()=>{advance(10);raf?.();}};
}

test('all five physical gestures reach real combat and increment hits', async()=>{
  const t=await setup();
  for(const action of ['attack','dodgeLeft','dodgeRight','duck','jump']) {
    t.feed(null,3); t.sandbox.openPrompt(action); t.feed(action);
    assert.equal(t.attempts.at(-1).actualAction,action);
    assert.equal(t.attempts.at(-1).outcome,'success');
    assert.equal(t.game.waitingInput,false);
  }
  assert.equal(t.game.hits,5); assert.equal(t.game.enemyHits,1); assert.equal(t.game.lives,10);
  assert.equal(t.animations.length,5);
});

test('gesture begun just before a prompt is not consumed outside combat; holding cannot score twice',async()=>{
  const t=await setup();
  t.feed('attack'); assert.equal(t.attempts.length,0);
  t.sandbox.openPrompt('attack'); t.feed('attack'); assert.equal(t.attempts.length,1);
  t.sandbox.openPrompt('attack'); t.feed('attack',4); assert.equal(t.attempts.length,1);
  t.feed(null,2);t.feed('attack');assert.equal(t.attempts.length,2);
});

test('old held gesture does not respond automatically; a fresh gesture does',async()=>{
  const t=await setup(); t.feed('duck',15);t.sandbox.openPrompt('duck');t.feed('duck');assert.equal(t.attempts.length,0);
  t.feed(null,2);t.feed('duck');assert.equal(t.attempts.length,1);
});

test('wrong action is still penalized; game is not auto-playing the expected action',async()=>{
  const t=await setup();t.sandbox.openPrompt('dodgeRight');t.feed('dodgeLeft');
  assert.equal(t.attempts[0].outcome,'miss');assert.equal(t.game.lives,9);
});

test('inversion and disabled jump remain respected',async()=>{
  const t=await setup();t.getElement('poseGameInvert').checked=true;t.sandbox.openPrompt('dodgeRight');t.feed('dodgeLeft');
  assert.equal(t.attempts[0].actualAction,'dodgeRight');
  t.game.jumpDisabled=true;t.feed(null,2);t.sandbox.openPrompt('attack');t.feed('jump');assert.equal(t.attempts.length,1);
});

test('duplicate video frames do not confirm gestures; tracking loss suspends timeout',async()=>{
  const t=await setup();t.sandbox.openPrompt('attack');t.feed('attack',1);t.duplicate();t.duplicate();assert.equal(t.attempts.length,0);
  t.feed('missing',16);assert.equal(t.sandbox.getGameInputState().trackingReady,false);
  t.advance(3000);assert.equal(t.attempts.length,0);assert.equal(t.game.waitingInput,true);
  t.feed(null,3);t.feed('attack');assert.equal(t.attempts[0].outcome,'success');
});

test('recalibration during a prompt pauses it and requires valid landmarks',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.sandbox.calibratePoseGameControl();
  t.advance(3000);assert.equal(t.attempts.length,0);assert.equal(t.sandbox.getGameInputState().trackingReady,false);
  t.feed(null,16);t.feed('duck');assert.equal(t.attempts[0].outcome,'success');
});


function guardPose() {
  const p=neutralPose();
  for(const [elbow,wrist] of [[13,15],[14,16]]) {
    p[elbow].z=-.06; p[elbow].y=.48;
    p[wrist].z=-.13; p[wrist].y=.37;
  }
  return p;
}

test('stationary camera jitter and isolated landmark spikes never send actions',async()=>{
  const t=await setup();t.sandbox.openPrompt('attack');
  for(let i=0;i<32;i++) {
    const p=neutralPose();
    for(const [j,v] of p.entries()) if(v) {
      v.x+=.008*Math.sin(i*1.17+j); v.y+=.008*Math.cos(i*.71+j); v.z+=.009*Math.sin(i*.9+j);
    }
    if(i===10 || i===23) p[15].z-=.10; // one bad frame, not a punch
    t.feed(p,1);
  }
  assert.equal(t.attempts.length,0);assert.equal(t.game.waitingInput,true);
  assert.equal(t.getElement('poseGameAction').textContent,'Ação: --');
});

test('both arms must straighten from guard; bending or wrist movement alone never attacks',async()=>{
  const guard=guardPose(); const t=await setup(guard);
  for(const wrist of [15,16]) {
    t.feed(guard,4); t.sandbox.openPrompt('attack');
    const bent=guardPose(); bent[wrist].z-=.055;
    const before=t.attempts.length;
    t.feed(bent,4); assert.equal(t.attempts.length,before);
    const p=extendArm(guardPose(),wrist);
    t.feed(guard,2); t.feed(p,2); assert.equal(t.attempts.length,before+1);
    assert.equal(t.attempts.at(-1)?.outcome,'success');
    assert.equal(t.attempts.at(-1)?.actualAction,'attack');
    t.feed(p,12); assert.equal(t.getElement('poseGameAction').textContent,'Ação: --');
  }
  assert.equal(t.attempts.length,2);
});

test('an occluded elbow cannot establish or confirm a punch',async()=>{
  const guard=guardPose();const t=await setup(guard);t.sandbox.openPrompt('attack');
  const p=extendArm(guardPose(),15);p[13].visibility=.1;
  t.feed(p,3);assert.equal(t.attempts.length,0);
  t.feed(extendArm(guardPose(),15),3);assert.equal(t.attempts.length,0);
  t.feed(guard,2);t.feed(extendArm(guardPose(),15),2);
  assert.equal(t.attempts.at(-1)?.outcome,'success');
});

test('arm moving sideways/up or whole body advancing is not a punch',async()=>{
  const t=await setup();t.sandbox.openPrompt('attack');
  const side=neutralPose();side[13].x-=.1;side[15].x-=.2;side[15].y-=.15;
  t.feed(side,6);t.feed(null,4);
  const forward=neutralPose();for(const v of forward.filter(Boolean))v.z-=.15;
  t.feed(forward,6);assert.equal(t.attempts.length,0);assert.equal(t.game.waitingInput,true);
});

test('static guard and reacquisition of wrist at a new depth are not punches',async()=>{
  const guard=guardPose(); const t=await setup(guard);t.sandbox.openPrompt('attack');
  t.feed(guard,10);
  const hidden=guardPose();hidden[15].visibility=.1;t.feed(hidden,4);
  const forward=guardPose();forward[15].z-=.10;t.feed(forward,12);
  assert.equal(t.attempts.length,0);assert.equal(t.game.waitingInput,true);
});


test('legacy head controls cannot inject actions while webcam is active; keyboard still works',async()=>{
  const t=await setup();t.sandbox.openPrompt('attack');
  assert.equal(t.sandbox.dispatchGameAction('attack','cabeça'),false);
  assert.equal(t.attempts.length,0);
  assert.equal(t.sandbox.dispatchGameAction('attack','teclado'),true);
  assert.equal(t.attempts.length,1);
});


test('holding an extended arm, even with depth jitter, cannot produce another punch',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  t.feed(extendArm(guardPose(),15),2);assert.equal(t.attempts.length,1);
  t.sandbox.openPrompt('attack');
  for(let i=0;i<24;i++) {
    const p=extendArm(guardPose(),15);
    p[13].z+=.008*Math.sin(i);p[15].z+=.015*Math.cos(i);
    t.feed(p,1);
  }
  assert.equal(t.attempts.length,1);
  t.feed(guardPose(),2);t.feed(extendArm(guardPose(),15),2);
  assert.equal(t.attempts.length,2);
});

test('an already extended arm during calibration or reacquisition is not a new punch',async()=>{
  const p=extendArm(guardPose(),15); const t=await setup(p);
  t.sandbox.openPrompt('attack');t.feed(p,8);assert.equal(t.attempts.length,0);
  t.feed(guardPose(),2);t.feed(p,2);assert.equal(t.attempts.length,1);
});

test('a single extended frame or alternating arms cannot confirm a punch',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  t.feed(extendArm(guardPose(),15),1);
  t.feed(extendArm(guardPose(),16),1);
  t.feed(guardPose(),3);assert.equal(t.attempts.length,0);
  t.feed(extendArm(guardPose(),16),2);assert.equal(t.attempts.length,1);
});

test('a fully straight arm pointing sideways or down does not punch',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  const sideways=guardPose();Object.assign(sideways[13],{x:.28,y:.4,z:0});Object.assign(sideways[15],{x:.15,y:.4,z:0});
  t.feed(sideways,4);assert.equal(t.attempts.length,0);
  const down=guardPose();Object.assign(down[13],{x:.4,y:.60,z:0});Object.assign(down[15],{x:.4,y:.80,z:0});
  t.feed(guardPose(),2);t.feed(down,4);assert.equal(t.attempts.length,0);
  t.feed(extendArm(guardPose(),15),3);assert.equal(t.attempts.length,0);
});

test('alternating full punches need no global neutral frame if each arm was retracted',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  const left=extendArm(guardPose(),15);t.feed(left,2);assert.equal(t.attempts.length,1);
  t.sandbox.openPrompt('attack');t.feed(extendArm(left,16),2);assert.equal(t.attempts.length,2);
});

test('a held punch cannot fire again after an unrelated dodge',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  const held=extendArm(guardPose(),15);t.feed(held,2);assert.equal(t.attempts.length,1);
  t.sandbox.openPrompt('dodgeLeft');
  const shifted=held.map(v=>v?{...v,x:v.x-.06}:v);
  t.feed(shifted,2);assert.equal(t.attempts.at(-1)?.actualAction,'dodgeLeft');
  t.sandbox.openPrompt('attack');t.feed(held,10);assert.equal(t.attempts.length,2);
  t.feed(guardPose(),2);t.feed(held,2);assert.equal(t.attempts.length,3);
});

test('gradual extension through intermediate elbow angles still produces a punch',async()=>{
  const guard=guardPose(); const t=await setup(guard);t.sandbox.openPrompt('attack');
  const extended=extendArm(guardPose(),15);
  for (const progress of [.2,.4,.6,.8,1,1]) {
    const p=guardPose();
    for (const i of [13,15]) for (const k of ['x','y','z']) p[i][k]=guard[i][k]+progress*(extended[i][k]-guard[i][k]);
    t.feed(p,1);
  }
  assert.equal(t.attempts.length,1);
});

// Regressões de recuperação: cada eixo é independente, sem trava global.
function offsetPose(x=0,y=0) {
  return neutralPose().map(p=>p?{...p,x:p.x+x,y:p.y+y}:p);
}
function withFeet(p, y=.96) {
  p[27]={x:.43,y,z:0,visibility:1};p[28]={x:.57,y,z:0,visibility:1};return p;
}

test('standing up with a small upward overshoot does not jump, but a subsequent jump works',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.feed('duck',4);
  assert.equal(t.attempts.length,1);t.sandbox.openPrompt('jump');
  t.feed(offsetPose(0,.045),1);t.feed(null,1);t.feed(offsetPose(0,-.09),3);
  assert.equal(t.attempts.length,1);
  t.feed(null,2);t.feed('jump',2);assert.equal(t.attempts.at(-1).actualAction,'jump');assert.equal(t.attempts.length,2);
});

test('landing with small downward overshoot does not crouch',async()=>{
  const t=await setup();t.sandbox.openPrompt('jump');t.feed('jump',4);
  t.sandbox.openPrompt('duck');t.feed(null,1);t.feed(offsetPose(0,.115),3);assert.equal(t.attempts.length,1);
  t.feed(null,2);t.feed('duck',2);assert.equal(t.attempts.length,2);
});

test('small return overshoot in either lateral direction does not trigger the opposite dodge',async()=>{
  for(const [first,second] of [['dodgeLeft','dodgeRight'],['dodgeRight','dodgeLeft']]) {
    const t=await setup();t.sandbox.openPrompt(first);t.feed(first,4);
    t.sandbox.openPrompt(second);t.feed(null,1);t.feed(second,3);assert.equal(t.attempts.length,1);
    t.feed(null,2);t.feed(second,2);assert.equal(t.attempts.length,2);
  }
});

test('a crouch performed outside a prompt also filters its return',async()=>{
  const t=await setup();t.feed('duck',4);t.sandbox.openPrompt('jump');
  t.feed('jump',3);assert.equal(t.attempts.length,0);
  t.feed(null,2);t.feed('jump',2);assert.equal(t.attempts.length,1);
});

test('a dodge can start while the player is still rising, without global neutral frames',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.feed('duck',4);
  t.sandbox.openPrompt('dodgeRight');t.feed(offsetPose(.06,.065),2);
  assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,'dodgeRight');
});

test('crouch can start with the body still shifted laterally',async()=>{
  const t=await setup();t.sandbox.openPrompt('dodgeLeft');t.feed('dodgeLeft',4);
  t.sandbox.openPrompt('duck');t.feed(offsetPose(-.06,.13),2);
  assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,'duck');
});

test('a large intentional reverse dodge works without a pause in the center',async()=>{
  const t=await setup();t.sandbox.openPrompt('dodgeLeft');t.feed('dodgeLeft',4);
  t.sandbox.openPrompt('dodgeRight');t.feed(offsetPose(.085,0),2);
  assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,'dodgeRight');
});

test('a direct real jump after crouching is allowed if visible feet rise',async()=>{
  const t=await setup(withFeet(neutralPose()));t.sandbox.openPrompt('duck');t.feed(withFeet(offsetPose(0,.13)),4);
  t.sandbox.openPrompt('jump');t.feed(withFeet(offsetPose(0,-.09),.87),2);
  assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,'jump');
});

test('large upward trunk overshoot with feet planted does not count as jump during recovery',async()=>{
  const t=await setup(withFeet(neutralPose()));t.sandbox.openPrompt('duck');t.feed(withFeet(offsetPose(0,.13)),4);
  t.sandbox.openPrompt('jump');t.feed(withFeet(offsetPose(0,-.14)),3);assert.equal(t.attempts.length,1);
  t.feed(withFeet(neutralPose()),2);t.feed(withFeet(offsetPose(0,-.09),.87),2);assert.equal(t.attempts.length,2);
});

test('only the recovering axis must cross its center band; other axis can remain displaced',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.feed('duck',4);
  t.sandbox.openPrompt('dodgeLeft');t.feed(offsetPose(-.06,.04),2);assert.equal(t.attempts.length,2);
  t.sandbox.openPrompt('jump');t.feed(offsetPose(-.06,-.09),2);assert.equal(t.attempts.length,3);assert.equal(t.attempts.at(-1).actualAction,'jump');
});

test('punch remains responsive while recovering from a crouch',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('duck');
  t.feed(guardPose().map(p=>p?{...p,y:p.y+.13}:p),4);
  t.sandbox.openPrompt('attack');t.feed(extendArm(guardPose().map(p=>p?{...p,y:p.y+.045}:p),15),2);
  assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,'attack');
});

test('brief pose loss does not remove opposite recovery protection',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.feed('duck',4);
  t.sandbox.openPrompt('jump');t.feed(null,1);t.feed('missing',1);t.feed(null,1);t.feed('jump',3);
  assert.equal(t.attempts.length,1);
  t.feed(null,2);t.feed('jump',2);assert.equal(t.attempts.length,2);
});

test('strong jump during crouch recovery still works without visible feet',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.feed('duck',4);
  t.sandbox.openPrompt('jump');t.feed(offsetPose(0,-.14),2);
  assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,'jump');
});

test('same-direction body gestures retain v4 release behavior',async()=>{
  for(const action of ['duck','jump','dodgeLeft','dodgeRight']) {
    const t=await setup();t.sandbox.openPrompt(action);t.feed(action,3);
    t.sandbox.openPrompt(action);t.feed(null,2);t.feed(action,2);
    assert.equal(t.attempts.length,2);assert.equal(t.attempts.at(-1).actualAction,action);
  }
});

// v8: realistic foreshortening and temporal variation of a forward punch.
function compactPunch(wrist=15, depth=.19, elbowDepth=.09, visibility=.42) {
  const p=guardPose(), shoulder=p[wrist-4];
  Object.assign(p[wrist-2],{x:shoulder.x+.025,y:shoulder.y+.04,z:shoulder.z-elbowDepth,visibility});
  Object.assign(p[wrist],{x:shoulder.x+.05,y:shoulder.y+.08,z:shoulder.z-depth,visibility});
  return p;
}

test('compact extended punches with moderate landmark confidence reach combat on either arm',async()=>{
  const t=await setup(guardPose());
  for(const wrist of [15,16]) {
    t.feed(guardPose(),3);t.sandbox.openPrompt('attack');
    const before=t.attempts.length;
    t.feed(compactPunch(wrist),2);
    assert.equal(t.attempts.length,before+1);
    assert.equal(t.attempts.at(-1).outcome,'success');
  }
});

test('an elbow can straighten before the wrist reaches the required forward depth',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  const short=compactPunch(15,.15,.075,1);
  t.feed(short,2);assert.equal(t.attempts.length,0);
  t.feed(compactPunch(15,.19,.09,1),2);assert.equal(t.attempts.length,1);
});

test('small elbow-angle jitter at the end of a real extension does not cancel a punch',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  const straight=compactPunch(15,.21,.10,1);
  const jitter=structuredClone(straight);jitter[13].x+=.032;
  t.feed(straight,1);assert.equal(t.attempts.length,0);
  t.feed(jitter,1);assert.equal(t.attempts.length,1);
});

test('an old shallow extension cannot become an attack by gradually drifting forward',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  t.feed(compactPunch(15,.15,.075,1),12);
  t.feed(compactPunch(15,.19,.09,1),3);assert.equal(t.attempts.length,0);
  t.feed(guardPose(),2);t.feed(compactPunch(15,.19,.09,1),2);assert.equal(t.attempts.length,1);
});


test('a fast punch may confirm using the almost straight frame immediately before full extension',async()=>{
  const t=await setup(guardPose());t.sandbox.openPrompt('attack');
  const peak=compactPunch(15,.21,.10,1);
  const before=structuredClone(peak);before[13].x+=.032;
  t.feed(before,1);assert.equal(t.attempts.length,0);
  t.feed(peak,1);t.feed(guardPose(),2);
  assert.equal(t.attempts.length,1);
});

// v9: verify the capture pipeline, rather than feeding already remapped points.
for(const [width,height] of [[1280,720],[640,480],[480,640]]) {
  test(`contain mapping aligns off-center skeleton with same frame at ${width}x${height}`,async()=>{
    const p=offsetPose(.11,0);
    const t=await setup(p,{width,height});
    const baseline=t.sandbox.__corpusVRPoseDebug.baseline();
    assert.ok(Math.abs(baseline.noseX-.61)<1e-8);
    assert.ok(Math.abs(baseline.noseY-.27)<1e-8);
    const canvas=t.getElement('poseControlCanvas');
    t.draws.length=0;t.feed(p,1);
    const [capture,preview]=t.draws.filter(d=>d.key==='drawImage');
    assert.equal(capture.args[0],t.video);
    assert.equal(capture.args.length,5);
    assert.deepEqual(preview.args.slice(1,5),capture.args.slice(1,5));
    assert.equal(preview.args.length,9);
    assert.equal(preview.args[0].width,512);
    assert.deepEqual(preview.args.slice(5),[0,0,canvas.width,canvas.height]);
    assert.ok(t.draws.some(d=>d.key==='scale'&&d.args[0]===-1));
    const nose=t.draws.find(d=>d.key==='arc'&&d.args[2]===5);
    assert.ok(Math.abs(nose.args[0]-.39*canvas.width)<1e-8);
    assert.ok(Math.abs(nose.args[1]-.27*canvas.height)<1e-8);
    assert.match(t.modelOptions[0].baseOptions.modelAssetPath,/pose_landmarker_full/);
    assert.equal(t.modelOptions[0].baseOptions.delegate,'GPU');
  });
}

test('Full model falls back to CPU if GPU initialization fails',async()=>{
  const t=await setup(null,{failGpu:true});
  assert.deepEqual(t.modelOptions.map(o=>o.baseOptions.delegate),['GPU','CPU']);
  assert.ok(t.modelOptions.every(o=>o.baseOptions.modelAssetPath.includes('pose_landmarker_full')));
  t.sandbox.openPrompt('attack');t.feed('attack');assert.equal(t.attempts[0].outcome,'success');
});

test('smaller deliberate dodges are detected equally left and right',async()=>{
  for(const direction of [-1,1]) {
    const t=await setup();const action=direction<0?'dodgeLeft':'dodgeRight';
    t.sandbox.openPrompt(action);
    t.feed(offsetPose(direction*.023,0),1);
    t.feed(offsetPose(direction*.042,0),2);
    assert.equal(t.attempts.at(-1)?.actualAction,action);
    assert.equal(t.attempts.at(-1)?.outcome,'success');
  }
});

test('isolated head movements and small lateral adjustments remain ignored',async()=>{
  const t=await setup();t.sandbox.openPrompt('dodgeLeft');
  const head=neutralPose();head[0].x-=.09;t.feed(head,4);t.feed(null,3);
  t.feed(offsetPose(-.018,0),4);assert.equal(t.attempts.length,0);
});

test('jump preparation does not consume the prompt as a crouch',async()=>{
  const t=await setup();t.sandbox.openPrompt('jump');
  t.feed(offsetPose(0,.10),3);assert.equal(t.attempts.length,0);
  t.feed('jump',2);assert.equal(t.attempts.at(-1)?.actualAction,'jump');assert.equal(t.attempts.at(-1)?.outcome,'success');
});

test('forward bend without hip descent is ignored, deeper squat is detected',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');
  const p=offsetPose(0,.13);p[23].y-=.12;p[24].y-=.12;
  t.feed(p,3);assert.equal(t.attempts.length,0);
  t.feed(null,2);t.feed('duck',2);assert.equal(t.attempts.at(-1)?.outcome,'success');
});

function crossedPose() {
  const p=neutralPose();
  Object.assign(p[13],{x:.38,y:.57,z:-.07});
  Object.assign(p[14],{x:.62,y:.57,z:-.07});
  Object.assign(p[15],{x:.62,y:.32,z:-.16});
  Object.assign(p[16],{x:.38,y:.32,z:-.16});
  return p;
}

test('crossing forearms in X pauses via the actual desktop menu; holding does not repeat',async()=>{
  const t=await setup();t.sandbox.openPrompt('attack');
  t.feed(crossedPose(),5);assert.equal(t.game.paused,false);
  t.feed(crossedPose(),9);assert.equal(t.game.paused,true);
  assert.equal(t.getElement('pauseMenuDesktop').classList.contains('open'),true);
  assert.equal(t.getElement('pauseMenuDesktopToggle').getAttribute('aria-expanded'),'true');
  t.feed(crossedPose(),65);assert.equal(t.game.paused,true);
  assert.equal(t.attempts.length,0);assert.equal(t.game.lives,10);
  assert.equal(t.sandbox.dispatchGameAction('attack','teclado'),false);
  t.feed(null,7);t.feed(crossedPose(),13);assert.equal(t.game.paused,false);
  assert.equal(t.getElement('pauseMenuDesktop').classList.contains('open'),false);
  t.feed(crossedPose(),8);assert.equal(t.game.paused,false);
  t.feed(null,8);t.feed('attack',2);assert.equal(t.attempts.length,1);
  assert.equal(t.attempts[0].outcome,'success');
  assert.equal(t.attempts[0].actualAction,'attack');
});

test('guard, low crossed wrists and brief cross do not pause',async()=>{
  const t=await setup();
  t.feed(guardPose(),25);assert.equal(t.game.paused,false);
  const low=crossedPose();low[15].y=.63;low[16].y=.63;
  t.feed(low,25);assert.equal(t.game.paused,false);
  t.feed(crossedPose(),5);t.feed(null,7);t.feed(crossedPose(),5);
  assert.equal(t.game.paused,false);
});

test('gesture cannot repeat due to occluded wrists or tracking loss',async()=>{
  const t=await setup();t.feed(crossedPose(),13);assert.equal(t.game.paused,true);
  const hidden=crossedPose();hidden[15].visibility=.05;hidden[16].visibility=.05;
  t.feed(hidden,20);t.feed(crossedPose(),15);assert.equal(t.game.paused,true);
  t.feed('missing',20);t.feed(crossedPose(),20);assert.equal(t.game.paused,true);
  t.feed(null,7);t.feed(crossedPose(),13);assert.equal(t.game.paused,false);
});

test('manual pause preserves remaining reaction time and does not count it in statistics',async()=>{
  const t=await setup();t.sandbox.openPrompt('duck');t.advance(300);
  const started=t.game.promptStartTime, phaseStarted=t.game.phaseStartTime;
  t.sandbox.setDesktopPauseMenuVisible(true);t.advance(5000);
  assert.equal(t.attempts.length,0);assert.equal(t.game.waitingInput,true);
  t.sandbox.setDesktopPauseMenuVisible(false);
  assert.equal(t.game.promptStartTime,started+5000);
  assert.equal(t.game.phaseStartTime,phaseStarted+5000);
  t.advance(1199);assert.equal(t.attempts.length,0);
  t.advance(1);assert.equal(t.attempts.length,1);assert.equal(t.attempts[0].outcome,'timeout');
});

test('tracking loss and manual pause overlap without charging time twice',async()=>{
  const t=await setup();t.sandbox.openPrompt('attack');t.advance(300);
  t.sandbox.setDesktopPauseMenuVisible(true);t.feed('missing',20);
  assert.equal(t.sandbox.getGameInputState().trackingReady,false);
  t.sandbox.setDesktopPauseMenuVisible(false);t.advance(5000);
  assert.equal(t.attempts.length,0);
  t.feed(null,3);t.feed('attack');assert.equal(t.attempts[0].outcome,'success');
  assert.ok(t.attempts[0].reactionTime<1);
});

test('pause freezes combat cooldowns, telegraphs and phase-transition callbacks',async()=>{
  const t=await setup();let events=[];
  t.sandbox.setCombatTimeout(()=>events.push('windup'),200);
  t.sandbox.setCombatTimeout(()=>events.push('transition'),900);
  t.advance(100);t.sandbox.setDesktopPauseMenuVisible(true);t.advance(5000);
  assert.deepEqual(events,[]);t.sandbox.setDesktopPauseMenuVisible(false);
  t.advance(99);assert.deepEqual(events,[]);t.advance(1);assert.deepEqual(events,['windup']);
  t.advance(700);assert.deepEqual(events,['windup','transition']);
  const cancelled=t.sandbox.setCombatTimeout(()=>events.push('cancelled'),100);
  t.sandbox.setDesktopPauseMenuVisible(true);t.sandbox.clearCombatTimeout(cancelled);
  t.sandbox.setDesktopPauseMenuVisible(false);t.advance(1000);
  assert.deepEqual(events,['windup','transition']);
});

test('pause after successful defense preserves real next-round callback',async()=>{
  const t=await setup();let resumes=0;
  t.getElement('enemy').components['enemy-ai'].resumeCombat=()=>resumes++;
  t.sandbox.openPrompt('dodgeLeft');t.feed('dodgeLeft');assert.equal(t.attempts[0].outcome,'success');
  t.advance(200);t.sandbox.setDesktopPauseMenuVisible(true);t.advance(3000);assert.equal(resumes,0);
  t.sandbox.setDesktopPauseMenuVisible(false);t.advance(699);assert.equal(resumes,0);t.advance(1);assert.equal(resumes,1);
});

function supermanPose() {
  const p=neutralPose();
  Object.assign(p[13],{x:.29,y:.54,z:.02});
  Object.assign(p[14],{x:.71,y:.54,z:.02});
  Object.assign(p[15],{x:.42,y:.63,z:-.03});
  Object.assign(p[16],{x:.58,y:.63,z:-.03});
  return p;
}

test('calibration does not start combat; same visible button starts, waits between phases, then ends',async()=>{
  const t=await setup(null,{initialRunning:false});
  const button=t.getElement('computerVisionRestart');
  assert.equal(button.textContent,'Iniciar jogo');assert.equal(button.hidden,false);
  assert.equal(t.game.running,false);assert.equal(t.lifecycle.resumes,0);
  assert.equal(t.sandbox.openPrompt('attack'),false);
  t.advance(10000);assert.equal(t.lifecycle.resumes,0);assert.equal(t.attempts.length,0);
  button.emit('click');assert.equal(t.game.running,true);assert.equal(t.lifecycle.resumes,1);assert.equal(button.textContent,'Encerrar partida');
  for(let i=0;i<3;i++){t.sandbox.openPrompt('attack');assert.equal(t.sandbox.dispatchGameAction('attack','teclado'),true);}
  t.advance(1450);assert.equal(t.game.phase,2);assert.equal(t.game.awaitingEnemyStart,true);
  assert.equal(button.textContent,'Iniciar fase');assert.equal(t.sandbox.openPrompt('attack'),false);
  t.advance(10000);assert.equal(t.lifecycle.resumes,1);assert.equal(t.attempts.length,3);
  button.emit('click');assert.equal(t.game.awaitingEnemyStart,false);assert.equal(t.lifecycle.resumes,2);assert.equal(button.textContent,'Encerrar partida');
  t.sandbox.openPrompt('jump');button.emit('click');assert.equal(t.game.running,false);assert.equal(button.textContent,'Iniciar jogo');
  t.advance(20000);assert.equal(t.attempts.length,3);assert.equal(t.lifecycle.resumes,2);
  assert.deepEqual(t.lifecycle.summaries,['concluida','interrompida']);
});

test('hands on hips invokes the same button command once per pose, including ending a match',async()=>{
  const t=await setup(null,{initialRunning:false});const button=t.getElement('computerVisionRestart');
  t.feed(supermanPose(),10);assert.equal(t.game.running,false);
  t.feed(supermanPose(),14);assert.equal(t.game.running,true);assert.equal(button.textContent,'Encerrar partida');
  t.feed(supermanPose(),70);assert.equal(t.game.running,true);assert.equal(t.lifecycle.resumes,1);
  t.feed(null,10);t.feed(supermanPose(),20);assert.equal(t.game.running,true);
  t.feed(supermanPose(),14);assert.equal(t.game.running,false);assert.equal(button.textContent,'Iniciar jogo');
  t.feed(supermanPose(),50);assert.equal(t.game.running,false);assert.equal(t.lifecycle.resumes,1);
  t.feed(null,10);t.feed(supermanPose(),24);assert.equal(t.game.running,true);assert.equal(t.lifecycle.resumes,2);
});

test('hands on hips starts the next phase but cannot end it until released',async()=>{
  const t=await setup(null,{initialRunning:false});t.getElement('computerVisionRestart').emit('click');
  t.sandbox.advanceToNextPhaseAfterDeath();assert.equal(t.game.awaitingEnemyStart,true);
  t.feed(null,3);t.feed(supermanPose(),24);assert.equal(t.game.awaitingEnemyStart,false);
  t.feed(supermanPose(),70);assert.equal(t.game.running,true);assert.equal(t.lifecycle.resumes,2);
});

test('changing custom settings waits for explicit command and applies the final values',async()=>{
  const t=await setup(null,{initialRunning:false});const button=t.getElement('computerVisionRestart');
  button.emit('click');t.sandbox.openPrompt('attack');t.sandbox.setDesktopPauseMenuVisible(true);
  const custom=t.getElement('customModeEnabled');custom.checked=true;custom.emit('change');
  assert.equal(t.game.running,false);assert.equal(button.textContent,'Iniciar jogo');
  assert.equal(t.getElement('pauseMenuDesktop').classList.contains('open'),true);
  t.getElement('customLives').value='7';t.getElement('customLives').emit('change');
  t.getElement('customEnemyHits').value='9';t.getElement('customEnemyHits').emit('change');
  t.getElement('customDifficulty').value='4';t.getElement('customDifficulty').emit('change');
  t.advance(10000);assert.equal(t.lifecycle.resumes,1);assert.equal(t.attempts.length,0);
  t.feed(null,3);t.feed(supermanPose(),24);
  assert.equal(t.game.running,true);assert.equal(t.game.customMode,true);assert.equal(t.game.lives,7);
  assert.equal(t.game.enemyHitsNeeded,9);assert.equal(t.game.difficultyPhase,4);assert.equal(t.lifecycle.resumes,2);
  assert.equal(t.getElement('pauseMenuDesktop').classList.contains('open'),false);
});

test('single hand, raised arms, occluded hips, or brief waist pose cannot start',async()=>{
  const t=await setup(null,{initialRunning:false});
  const one=supermanPose();one[16]=neutralPose()[16];one[14]=neutralPose()[14];
  const high=supermanPose();high[15].y=high[16].y=.05;
  const hidden=supermanPose();hidden[23].visibility=hidden[24].visibility=.1;
  for(const pose of [one,high,hidden,guardPose(),crossedPose()]){t.feed(pose,35);assert.equal(t.game.running,false);}
  t.feed(supermanPose(),10);t.feed('missing',10);t.feed(supermanPose(),12);assert.equal(t.game.running,false);
  t.feed(null,10);t.feed(supermanPose(),24);assert.equal(t.game.running,true);
  t.feed('missing',20);t.feed(supermanPose(),55);assert.equal(t.game.running,true);
});
