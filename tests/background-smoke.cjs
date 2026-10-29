const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/html');res.end(fs.readFileSync(file));});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:960}});context.setDefaultTimeout(15000);
    await context.route('https://i.ytimg.com/**',route=>route.fulfill({status:404,body:''}));
    await context.route('https://calendar.google.com/**',route=>route.fulfill({contentType:'text/calendar',body:'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'}));
    if(!process.env.REAL_YOUTUBE) await context.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body style="background:linear-gradient(130deg,#4e3024,#112d38);color:white">Video test fixture<script>
      window.commands=[];let currentTime=Number(new URL(location.href).searchParams.get('start'))||0,playerState=2;
      function send(event,info){parent.postMessage(JSON.stringify({event,info}),'*');}
      function report(){send('infoDelivery',{currentTime,duration:7200,playerState});}
      addEventListener('message',e=>{
        if(e.data?.type==='workspace-quality-request') {parent.postMessage({type:'workspace-quality-response',id:e.data.id,options:[{value:'720p',label:'720p'},{value:'auto',label:'Auto'}],selected:e.data.value||'auto'},'*');return;}
        let d;try{d=JSON.parse(e.data)}catch{return;}
        if(d.event==='listening'){send('onReady');report();}
        if(d.event==='command'){commands.push(d);
          if(d.func==='playVideo'||d.func==='pauseVideo'){playerState=d.func==='playVideo'?1:2;send('onStateChange',playerState);report();}
          if(d.func==='seekTo'){currentTime=d.args[0];report();}
        }
      });setInterval(()=>{if(playerState===1)currentTime+=.25;report();},250);
    </script></body></html>`}));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:'+server.address().port+'/preview.html';await page.goto(url);await page.locator('.cm-content').waitFor();
    assert.equal(await page.locator('#background-player').count(),0);
    await page.locator('#workspacesettingsbtn').click();
    assert.deepEqual(await page.locator('#background-category option').allTextContents(),['All','Cafe','Scenic','Abstract']);
    assert.deepEqual(await page.locator('#background-gallery h4').allTextContents(),['Cafe','Scenic','Abstract']);
    assert.equal(await page.locator('#background-pause, #background-muted').count(),0);
    assert.ok(await page.locator('#background-video-options').isHidden());
    await page.locator('#background-custom').check();
    await page.locator('#background-category').selectOption('Abstract');
    assert.equal(await page.locator('#background-gallery button').count(),5);
    for (const video of ['gx7KLCC7eKY','pUWCnazcsbU','hKckckhpbYY']) assert.equal(await page.locator('[data-video="'+video+'"]').count(),1);
    assert.equal(await page.locator('[data-video="dURktAeZDa8"]').count(),0);
    await page.locator('#background-category').selectOption('All');
    await page.locator('[data-video="5Cd5-S4zUBk"]').click();
    await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Playing');
    assert.ok(await page.locator('#background-player').isVisible());
    if(process.env.REAL_YOUTUBE){console.log('REAL YOUTUBE PLAYING');return;}
    await page.locator('#closeworkspacesettings').click();
    await page.waitForFunction(()=>!document.querySelector('#background-quality').disabled);
    await page.locator('#background-quality').selectOption('720p');
    await page.waitForFunction(()=>!document.querySelector('#background-quality').disabled);
    assert.equal(await page.locator('#background-quality').inputValue(),'720p');
    assert.equal(await page.locator('#background-controls').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.ok((await page.locator('#background-seek').boundingBox()).width<=100);
    assert.equal(await page.locator('#background-volume').inputValue(),'50');
    assert.equal(await page.locator('#background-mute').getAttribute('aria-pressed'),'true');
    await page.locator('#background-play').click();await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Paused');
    await page.locator('#background-play').click();await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Playing');
    await page.locator('#background-volume').fill('35');await page.locator('#background-volume').dispatchEvent('change');
    const frame=page.frames().find(f=>f.url().includes('youtube-nocookie'));
    assert.equal(await page.locator('#background-mute').getAttribute('aria-pressed'),'true');
    await page.locator('#background-mute').click();
    await frame.waitForFunction(()=>commands.some(c=>c.func==='unMute')&&commands.some(c=>c.func==='setVolume'&&c.args[0]===35));
    for(const point of [120,900,3600]) {
      await page.locator('#background-seek').fill(String(point));await page.locator('#background-seek').dispatchEvent('change');
      await frame.waitForFunction(point=>commands.some(c=>c.func==='seekTo'&&c.args[0]===point),point);
    }
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('np:backgroundPosition:5Cd5-S4zUBk')).time>=3600);
    await page.locator('#background-play').click();
    await page.reload();await page.locator('.cm-content').waitFor();
    await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Playing');
    assert.equal(await page.locator('#background-volume').inputValue(),'35');
    assert.equal(await page.locator('#background-mute').getAttribute('aria-pressed'),'true');
    assert.ok(+new URL(await page.locator('#background-player').getAttribute('src')).searchParams.get('start')>=3600);
    await page.waitForFunction(()=>+document.querySelector('#background-seek').value>=3600);
    await page.locator('#workspacesettingsbtn').click();
    await page.locator('#panel-opacity').fill('75');await page.locator('#panel-opacity').dispatchEvent('change');
    assert.equal(await page.locator('#background-shade').evaluate(el=>getComputedStyle(el).display),'none');
    assert.ok((await page.locator('#workspace').evaluate(el=>getComputedStyle(el).backgroundColor)).includes('0.75'));
    await page.locator('#background-blur').fill('8');await page.locator('#background-blur').dispatchEvent('change');
    assert.equal(await page.locator('#background-video').evaluate(el=>getComputedStyle(el).filter),'none');
    for(const id of ['workspace','agenda']) assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).backdropFilter),'blur(8px)');
    assert.equal(await page.locator('#workspacesettings').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
    assert.ok(!(await page.locator('#workspacesettings').evaluate(el=>getComputedStyle(el).backgroundColor)).includes('/'));
    await page.locator('#panel-opacity').fill('0');await page.locator('#panel-opacity').dispatchEvent('change');
    await page.locator('#closeworkspacesettings').click();
    await page.locator('.tab-pencil').click();
    assert.equal(await page.locator('#tabsettings').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
    assert.equal(await page.locator('#tabsettings').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('#workspacesettings').evaluate(el=>getComputedStyle(el).backgroundColor));
    const originalName=await page.locator('#tabname').inputValue();
    await page.locator('#tabname').fill('Unsaved title');assert.ok(await page.locator('#tabsettings').isVisible());
    await page.mouse.click(4,4);assert.ok(await page.locator('#tabsettings').isHidden());
    await page.locator('.tab-pencil').click();assert.equal(await page.locator('#tabname').inputValue(),originalName);
    await page.keyboard.press('Escape');assert.ok(await page.locator('#tabsettings').isHidden());
    await page.locator('#workspacesettingsbtn').click();
    await page.locator('#panel-opacity').fill('75');await page.locator('#panel-opacity').dispatchEvent('change');
    await page.locator('#calurl').fill('https://calendar.google.com/calendar/ical/test/basic.ics'); await page.locator('#calsave').click();
    await page.locator('#background-url').fill('https://example.com/watch?v=5Cd5-S4zUBk');await page.locator('#background-custom-form button').click();
    assert.ok((await page.locator('#background-error').innerText()).length);
    await page.locator('#background-url').fill('https://youtu.be/4vIQON2fDWM');await page.locator('#background-custom-form button').click();
    await page.waitForFunction(()=>document.querySelector('#background-player').src.includes('4vIQON2fDWM'));
    await page.locator('[data-video="5Cd5-S4zUBk"]').click();
    await page.waitForFunction(()=>{const src=document.querySelector('#background-player')?.src;return src?.includes('5Cd5-S4zUBk')&&+new URL(src).searchParams.get('start')>=3600;});
    await page.locator('[data-video="4vIQON2fDWM"]').click();
    await page.waitForFunction(()=>document.querySelector('#background-player')?.src.includes('4vIQON2fDWM'));
    await page.locator('#closeworkspacesettings').click();
    await page.locator('.cm-content').fill('# Focus workspace\n\nThe video stays behind my notes.');
    const notesBefore=await page.locator('#workspace').boundingBox();
    const grip=await page.locator('#workspace .panel-grip').boundingBox();
    await page.mouse.move(grip.x+20,grip.y+12);await page.mouse.down();await page.mouse.move(grip.x+65,grip.y+42,{steps:5});await page.mouse.up();
    const moved=await page.locator('#workspace').boundingBox(); assert.ok(moved.x>notesBefore.x+30);
    const edge=await page.locator('#workspace .panel-resize-e').boundingBox();
    assert.equal(await page.locator('#workspace .panel-resize-e').evaluate(el=>getComputedStyle(el).cursor),'ew-resize');
    await page.mouse.move(edge.x+3,edge.y+30);await page.mouse.down();await page.mouse.move(edge.x-77,edge.y+30,{steps:5});await page.mouse.up();
    const resized=await page.locator('#workspace').boundingBox();assert.ok(resized.width<moved.width-60);
    const calendarGrip=page.locator('#agenda .panel-grip');await calendarGrip.focus();await calendarGrip.press('ArrowLeft');
    const calendarBefore=await page.locator('#agenda').boundingBox();
    await page.locator('#agenda .panel-resize-w').focus();await page.locator('#agenda .panel-resize-w').press('ArrowLeft');
    assert.ok((await page.locator('#agenda').boundingBox()).width>calendarBefore.width);
    await page.locator('#hidebtn').click();
    const secondFrame=page.frames().find(f=>f.url().includes('youtube-nocookie'));
    await secondFrame.waitForFunction(()=>commands.filter(c=>['playVideo','pauseVideo'].includes(c.func)).at(-1)?.func==='playVideo');
    assert.ok(await page.locator('.cm-content').isHidden());assert.ok(await page.locator('#caltext').isHidden());
    assert.ok(await page.locator('#background-time').isHidden());assert.ok(await page.locator('#background-play').isVisible());
    assert.ok(await page.locator('#hidebtn').isVisible());
    await page.locator('#hidebtn').click();
    assert.equal(await page.locator('#hidebtn').evaluate(el=>el.parentElement.id),'calbar');
    assert.equal(await page.locator('#hidebtn').evaluate(el=>el.nextElementSibling.id),'workspacesettingsbtn');
    await page.reload();await page.locator('.cm-content').waitFor();
    assert.ok(Math.abs((await page.locator('#workspace').boundingBox()).width-resized.width)<2);
    assert.ok(Math.abs((await page.locator('#workspace').boundingBox()).x-resized.x)<2);
    await page.setViewportSize({width:480,height:800});
    const playerBounds=await page.locator('#background-controls').boundingBox();
    assert.ok(playerBounds.x>=0&&playerBounds.x+playerBounds.width<=480);
    for(const id of ['background-play','background-mute','background-volume','background-seek','background-time','background-quality']) {
      const bounds=await page.locator('#'+id).boundingBox();
      assert.ok(bounds.y>=playerBounds.y&&bounds.y+bounds.height<=playerBounds.y+playerBounds.height+1,'player stays on one line');
    }
    await page.waitForFunction(()=>['workspace','agenda'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}));
    for(const id of ['workspace','agenda']){const rect=await page.locator('#'+id).boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=480&&rect.y>=0&&rect.y+rect.height<=800);}
    await page.setViewportSize({width:1440,height:960});
    await page.waitForFunction(()=>document.getElementById('agenda').getBoundingClientRect().width>300);
    assert.ok((await page.locator('.cm-content').innerText()).includes('Focus workspace'));
    assert.ok((await page.locator('#background-player').getAttribute('src')).includes('4vIQON2fDWM'));
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/video-background.png')});
    const other=await context.newPage();await other.goto(url);await other.locator('.cm-content').waitFor();
    await page.locator('#workspacesettingsbtn').click();
    await page.locator('#reset-panels').click();
    assert.ok(Math.abs((await page.locator('#workspace').boundingBox()).x-32)<2);
    await page.locator('#background-solid').check();
    await other.waitForFunction(()=>!document.querySelector('#background-player'));
    assert.equal(await page.locator('#background-player').count(),0);
    assert.ok(await page.locator('#workspace .panel-grip').isHidden());
    assert.deepEqual(errors,[]);console.log('PASS: grouped gallery, player pause/volume/seek, per-video resume, panel appearance/drag/resize, veil, cross-tab changes, no browser errors.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
