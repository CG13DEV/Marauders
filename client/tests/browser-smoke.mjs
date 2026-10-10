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
  assert.equal(initial.extras,3);
  assert.equal(initial.openings.length,6);
  assert.ok(initial.openings.includes('wall-slot:portrait'));
  assert.ok(initial.openings.includes('wall-slot:boys'));
  assert.ok(initial.openings.includes('wall-slot:girls'));
  assert.ok(initial.openings.includes('wall-slot:west_window'));
  assert.ok(initial.canvasWidth>300);
  // The real keyboard input and rendered scene must move the real avatar.
  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');
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
  // Use real DOM passage selection, which must respect graph adjacency.
  await page.locator('.wing-card button').first().click();
  assert.equal(await page.locator('#dialog-backdrop').getAttribute('hidden'),null);
  await page.locator('.dorm-row button').first().click();
  const bedroom=await page.evaluate(()=>window.__towerTest.snapshot());
  assert.ok(bedroom.roomKey.startsWith('research_dorm_gryffindor'));
  assert.equal(bedroom.openings.length,3);
  await page.locator('#go-common').click();
  assert.equal((await page.evaluate(()=>
    window.__towerTest.snapshot())).roomKey,'dorm_gryffindor');
  assert.deepEqual(errors,[],'Runtime errors in real Chromium page');
  const screenshot=resolve('artifacts/tower.png');
  await mkdir(resolve('artifacts'),{recursive:true});
  await page.screenshot({path:screenshot,animations:'disabled'});
  console.log('[browser smoke] real WebGL scene, W movement, camera, graph-safe dorm, screenshot PASS');
}finally{
  await browser?.close();
  server.kill('SIGTERM');
}
