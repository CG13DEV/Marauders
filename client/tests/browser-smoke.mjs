/** Real Chromium/WebGL smoke test: unit tests cannot see invisible scenes.
 * Runs against the production Vite preview served under /Marauders/.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=4179;
const origin='http://127.0.0.1:'+port+'/Marauders/';
const server=spawn('npm',['run','preview','--','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:'inherit'});
let browser;
try{
  let ready=false;
  for(let i=0;i<55;i++){
    await new Promise(r=>setTimeout(r,350));
    try{const response=await fetch(origin);if(response.ok){ready=true;break;}}
    catch{/* startup */}
  }
  assert.ok(ready,'Vite preview never started');
  browser=await chromium.launch({
    headless:true,
    args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader','--disable-gpu-sandbox']
  });
  const page=await browser.newPage({viewport:{width:1380,height:840}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'?testMode=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__towerTest?.snapshot()?.canvasWidth),
    {timeout:15000});
  await page.waitForTimeout(500);
  const initial=await page.evaluate(()=>window.__towerTest.snapshot());
  console.log('[smoke] initial',JSON.stringify(initial),'errors',errors);
  assert.equal(initial.roomKey,'dorm_gryffindor');
  assert.equal(initial.identity,'peter');
  assert.equal(initial.live.player.key,'peter');
  assert.equal(initial.live.player.room,'dorm_gryffindor');
  assert.equal(await page.locator('#player-choice').inputValue(),'peter');
  assert.equal(initial.live.locations.length,4);
  assert.equal(initial.live.tick,67);
  assert.equal(initial.live.clock,'11:10');
  assert.ok(initial.live.activities.length>0);
  assert.ok(Number.isSafeInteger(initial.live.worldSeconds));
  assert.ok(Array.isArray(initial.live.journeys));
  assert.equal(initial.extras,initial.live.locations
    .filter(([,key])=>key===initial.roomKey).length);
  assert.ok(initial.extras>0,'Expected living NPC occupants in common room');
  const walked=await page.evaluate(()=>window.__towerTest.advanceLivingSeconds(30));
  assert.ok(walked.snapshot.activities.some(p=>p.mode!=='idle'),
    'Living room must make meaningful spatial decisions, not stand immobile');
  assert.ok(walked.snapshot.activities.some(p=>{
    const old=initial.live.activities.find(a=>a.actor===p.actor);
    return old&&Math.hypot(old.x-p.x,old.z-p.z)>.15;
  }),'No resident physically walked within the common room');
  await page.waitForFunction(()=>window.__towerTest.snapshot().visibleActors
    .some(a=>a.mode==='walking'),{timeout:15000});
  assert.equal(await page.locator('#living-people').locator('div').count(),
    walked.snapshot.activities.length);
  assert.match(await page.locator('#living-clock').textContent(),/ДЕНЬ/);
  // A browser observer advances the SAME ECS world that draws the avatars.
  const liveStep=await page.evaluate(()=>window.__towerTest.advanceLiving());
  assert.equal(liveStep.snapshot.tick,initial.live.tick+1);
  assert.equal(liveStep.delta.sequence,walked.snapshot.sequence+1);
  const beforePartial=await page.evaluate(()=>window.__towerTest.snapshot().live);
  const subTick=await page.evaluate(()=>window.__towerTest.advanceLivingSeconds(45));
  assert.equal(subTick.snapshot.tick,beforePartial.tick);
  assert.equal(subTick.snapshot.worldSeconds,beforePartial.worldSeconds+45);
  assert.ok(subTick.snapshot.journeys.every(j=>j.progress>=0&&j.progress<=1));
  assert.equal(initial.openings.length,6);
  assert.ok(initial.openings.includes('wall-slot:portrait'));
  assert.ok(initial.openings.includes('wall-slot:boys'));
  assert.ok(initial.openings.includes('wall-slot:girls'));
  assert.ok(initial.openings.includes('wall-slot:west_window'));
  assert.ok(initial.canvasWidth>300);
  // The real keyboard input and rendered scene must move the real avatar.
  await page.keyboard.down('w');
  // Software WebGL on CI can take >450 ms/frame. Wait for actual motion,
  // not an arbitrary wall-clock interval that flakes under CPU pressure.
  try{
    await page.waitForFunction(start=>{
      const now=window.__towerTest.snapshot().player;
      return Math.hypot(now.x-start.x,now.z-start.z)>.11;
    },initial.player,{timeout:20000});
  }finally{await page.keyboard.up('w');}
  const afterW=await page.evaluate(()=>window.__towerTest.snapshot());
  console.log('[smoke] after W',JSON.stringify(afterW),'errors',errors);
  const screenshot=resolve('artifacts/tower.png');
  await mkdir(resolve('artifacts'),{recursive:true});
  await page.screenshot({path:screenshot,animations:'disabled'});
  assert.ok(Math.hypot(afterW.player.x-initial.player.x,
    afterW.player.z-initial.player.z)>.10,
    'W did not move the avatar in the rendered WebGL scene');
  await page.keyboard.press('q');
  const afterCamera=await page.evaluate(()=>window.__towerTest.snapshot());
  assert.notEqual(afterCamera.cameraYaw,afterW.cameraYaw);
  // A door label is learned ONLY while physically at that staircase.
  await page.evaluate(()=>window.__towerTest.driveTo([
    {x:0,z:.5},{x:-7.9,z:.5}]));
  const discovered=await page.evaluate(()=>window.__towerTest.submitPlayer({
    type:'survey_wing',wing:'boys'}));
  assert.equal(discovered.ok,true);
  assert.ok(discovered.player.journal.some(note=>note.includes('таблички')));
  // Even developer navigation must not bypass the actual body in the world.
  await page.locator('.wing-card button').first().click();
  assert.equal(await page.locator('#dialog-backdrop').getAttribute('hidden'),null);
  await page.locator('.dorm-row button').first().click();
  const bedroom=await page.evaluate(()=>window.__towerTest.snapshot());
  assert.ok(bedroom.roomKey.startsWith('research_dorm_gryffindor'));
  assert.equal(bedroom.openings.length,3);
  assert.equal(bedroom.layout.kind,'bedroom');
  assert.equal(bedroom.layout.reservedSlots,5);
  assert.ok(bedroom.layout.occupied>0&&bedroom.layout.occupied<=5);
  assert.equal(bedroom.layout.bedPositions.length,bedroom.layout.occupied);
  for(const bed of bedroom.layout.bedPositions)
    assert.ok(Math.hypot(bed.x,bed.z)>5,'Bed is improperly in center');
  await page.screenshot({path:resolve('artifacts/bedroom.png'),
    animations:'disabled'});
  await page.evaluate(()=>window.__towerTest.driveTo([{x:0,z:5.52}]));
  await page.locator('#go-common').click();
  assert.equal((await page.evaluate(()=>
    window.__towerTest.snapshot())).roomKey,'dorm_gryffindor');
  // The portrait passage requires actually approaching the far wall.
  await page.evaluate(()=>window.__towerTest.driveTo([{x:0,z:12.65}]));
  await page.locator('.wing-card button').last().click();
  const landing=await page.evaluate(()=>window.__towerTest.snapshot());
  assert.equal(landing.roomKey,'west_landing_4');
  assert.equal(landing.layout.kind,'landing');
  assert.ok(landing.layout.bounds.maxZ>landing.layout.bounds.minZ);
  assert.deepEqual(landing.openings,['wall-slot:return']);
  assert.equal(landing.layout.grandStair,true);
  assert.equal(landing.live.player.grandStair.aligned,false,
    'The staircase begins in its alternate orientation in this seed');
  assert.deepEqual(landing.activePortals,['return','stair_gallery']);
  await page.screenshot({path:resolve('artifacts/landing.png'),
    animations:'disabled'});
  await page.evaluate(()=>window.__towerTest.driveTo([{x:0,z:-6.72}]));
  await page.locator('#go-common').click();
  assert.equal((await page.evaluate(()=>
    window.__towerTest.snapshot())).roomKey,'dorm_gryffindor');
  assert.ok((await page.evaluate(()=>
    window.__towerTest.snapshot().live.player.position.z))>10,
    'The Fat Lady leads through a real vestibule within the common-room node');
  // Genuine localized action, not a room-wide click from the entrance.
  const farInspect=await page.evaluate(()=>
    window.__towerTest.submitPlayer({type:'inspect_cup'}));
  assert.equal(farInspect.reason,'not_in_reach');
  await page.evaluate(()=>window.__towerTest.driveTo([{x:0,z:1.5}]));
  // Real player action, not a renderer-only state mutation.
  const oldCup=await page.evaluate(()=>window.__towerTest.snapshot().live.player.cup);
  assert.equal(oldCup.broken,false);
  const inspected=await page.evaluate(()=>
    window.__towerTest.submitPlayer({type:'inspect_cup'}));
  assert.equal(inspected.ok,true);
  assert.equal(inspected.player.cup.inspected,true);
  const broken=await page.evaluate(()=>
    window.__towerTest.submitPlayer({type:'break_cup'}));
  assert.equal(broken.ok,true);
  assert.equal(broken.player.cup.broken,true);
  assert.ok(broken.player.journal.some(note=>note.includes('чашк')));
  // Choose an unlinked game-mode page: the omniscient technical map is hidden.
  const gamePage=await browser.newPage({viewport:{width:1280,height:720}});
  await gamePage.goto(origin,{waitUntil:'networkidle'});
  assert.equal(await gamePage.locator('#tower-debug').isVisible(),false);
  assert.equal(await gamePage.locator('#player-knowledge').isVisible(),true);
  await gamePage.close();
  // G3: talk to somebody standing close, then ask about real witnessed events.
  const socialPage=await browser.newPage({viewport:{width:1380,height:900}});
  await socialPage.goto(origin+'?testMode=1',{waitUntil:'networkidle'});
  await socialPage.evaluate(()=>window.__towerTest.driveTo([{x:0,z:1.5}]));
  await socialPage.waitForFunction(()=>!document.querySelector('#talk-panel').hidden);
  assert.match(await socialPage.locator('#talk-target').textContent(),/Рядом:/);
  const brokenSocial=await socialPage.evaluate(()=>
    window.__towerTest.submitPlayer({type:'break_cup'}));
  assert.equal(brokenSocial.ok,true);
  const inspectedSocial=await socialPage.evaluate(()=>
    window.__towerTest.submitPlayer({type:'inspect_cup'}));
  assert.equal(inspectedSocial.ok,true);
  await socialPage.locator('#talk-question').click();
  assert.match(await socialPage.locator('#talk-reply').textContent(),/Разговор идёт/);
  assert.equal(await socialPage.locator('#talk-cancel').isVisible(),true);
  assert.equal(await socialPage.locator('#talk-chat').isDisabled(),true);
  assert.equal((await socialPage.evaluate(()=>
    window.__towerTest.snapshot().live.player)).lastInteraction,null);
  await socialPage.evaluate(()=>window.__towerTest.advanceLivingSeconds(44));
  assert.equal((await socialPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.interaction.remainingSeconds)),1);
  await socialPage.evaluate(()=>window.__towerTest.advanceLivingSeconds(1));
  assert.match(await socialPage.locator('#talk-reply').textContent(),/чашку разбил ты/);
  assert.equal(await socialPage.locator('#talk-cancel').isVisible(),false);
  assert.ok((await socialPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.journal)).some(s=>s.includes('Со слов')));
  await socialPage.close();

  // G3 geography: cross the real portrait threshold, find the gallery stair,
  // then physically enter and return — never hand-change the rendered room.
  const galleryPage=await browser.newPage({viewport:{width:1380,height:900}});
  await galleryPage.goto(origin+'?testMode=1',{waitUntil:'networkidle'});
  await galleryPage.evaluate(()=>window.__towerTest.driveTo([{x:0,z:12.65}]));
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().activeInteraction==='outside');
  await galleryPage.keyboard.press('f');
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().roomKey==='west_landing_4');
  await galleryPage.evaluate(()=>window.__towerTest.driveTo([{x:0,z:3.85}]));
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().activeInteraction==='stair_gallery');
  await galleryPage.keyboard.press('f'); // discover physical stair
  assert.ok((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.knownRooms)).includes('gallery_4'));
  const wrongStair=await galleryPage.evaluate(()=>
    window.__towerTest.submitPlayer({type:'move',destination:'gallery_4'}));
  assert.equal(wrongStair.reason,'stair_misaligned',
    'A moving flight must physically block access before it aligns');
  await galleryPage.evaluate(()=>window.__towerTest.advanceLivingSeconds(90));
  assert.equal((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.grandStair.aligned)),true);
  await galleryPage.keyboard.press('f'); // now the real staircase route is open
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().roomKey==='gallery_4');
  assert.equal((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().layout.kind)),'gallery');
  assert.ok((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().activePortals)).includes('return_landing'));
  // G3.3: the new bench exists in the rendered gallery, requires approach,
  // and waiting there advances real ECS world seconds without a free teleport.
  assert.ok((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().activePortals)).includes('gallery_bench'));
  assert.equal((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.grandStair.aligned)),true);
  await galleryPage.evaluate(()=>window.__towerTest.driveTo([{x:1.45,z:1.1}]));
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().activeInteraction==='gallery_bench');
  const galleryBefore=await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.worldSeconds);
  await galleryPage.keyboard.press('f');
  assert.equal((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.interaction?.type)),'wait_gallery');
  await galleryPage.evaluate(()=>window.__towerTest.advanceLivingSeconds(60));
  assert.equal((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.worldSeconds)),galleryBefore+60);
  assert.equal((await galleryPage.evaluate(()=>
    window.__towerTest.snapshot().live.player.lastInteraction?.status)),'completed');
  await galleryPage.evaluate(()=>window.__towerTest.driveTo([{x:0,z:-4.65}]));
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().activeInteraction==='return_landing');
  await galleryPage.keyboard.press('f');
  await galleryPage.waitForFunction(()=>
    window.__towerTest.snapshot().roomKey==='west_landing_4');
  await galleryPage.close();

  // Choosing a different Marauder must give the player that actual ECS
  // identity and remove their autonomous duplicate from the observer.
  await page.selectOption('#player-choice','james');
  await page.waitForFunction(()=>window.__towerTest?.snapshot()?.identity==='james',
    {timeout:20000});
  const chosen=await page.evaluate(()=>window.__towerTest.snapshot());
  assert.equal(chosen.live.player.key,'james');
  assert.equal(chosen.live.player.room,chosen.roomKey);
  assert.equal(chosen.live.locations.length,3);
  assert.ok(!chosen.live.locations.some(([key])=>key==='james'));
  assert.deepEqual(errors,[],'Runtime errors in real Chromium page');
  console.log('[browser smoke G2] player-local perceptions, validated walking, stair discovery, object reach, and hidden omniscient map PASS');
}finally{
  await browser?.close();
  server.kill('SIGTERM');
}
