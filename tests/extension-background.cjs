const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-extension-test-'));
  const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  context.setDefaultTimeout(25000);
  try{
    const session=await context.browser().newBrowserCDPSession();
    const {id}=await session.send('Extensions.loadUnpacked',{path:path.resolve(__dirname,'..')});
    let page=await context.newPage();const pageURL='chrome-extension://'+id+'/newtab.html';await page.goto(pageURL);await page.locator('.cm-content').waitFor();
    await page.locator('#workspacesettingsbtn').click();await page.locator('#background-custom').check();
    const videos=(process.env.VIDEO_IDS || '5Cd5-S4zUBk').split(',');
    for(const videoID of videos){
    await page.locator('[data-video="'+videoID+'"]').click();
    try{await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Playing');}
    catch(error){console.log('STATUS:',await page.locator('#background-status').innerText());throw error;}
    const rules=await page.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules());
    if(rules[0].condition.initiatorDomains[0]!==id)throw new Error('Rule must apply only to this extension');
    const videoFrame=page.frames().find(frame=>frame.url().startsWith('https://www.youtube-nocookie.com/embed/'));
    await videoFrame.waitForFunction(()=>{const video=document.querySelector('video');return video && video.currentTime > 2 && video.videoWidth > 0;});
    await page.locator('#closeworkspacesettings').click();
    await page.screenshot({path:path.resolve(__dirname,'../test-results/extension-video-'+videoID+'.png')});
    console.log('PASS: actual video playing: '+videoID);
    if(process.env.QUALITY_CONTROLS) {
      await page.waitForFunction(()=>!document.querySelector('#background-quality').disabled);
      console.log('QUALITY OPTIONS:',await page.locator('#background-quality option').allTextContents());
      await page.locator('#background-quality').selectOption('720p');
      await page.waitForFunction(()=>!document.querySelector('#background-quality').disabled);
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.videoHeight===720);
      await page.locator('#background-quality').selectOption('360p');
      await page.waitForFunction(()=>!document.querySelector('#background-quality').disabled);
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.videoHeight===360);
      const duplicateControls=await videoFrame.evaluate(()=>{
        const controls=document.querySelector('#player-controls,.ytp-chrome-bottom');
        return !controls||getComputedStyle(controls).opacity==='0';
      });
      if(!duplicateControls)throw new Error('Duplicate native controls should stay hidden');
      await page.screenshot({path:path.resolve(__dirname,'../test-results/extension-quality.png')});
      console.log('PASS: native quality picker changes actual video resolution to 720p then 360p');
    }
    if(process.env.PLAYER_CONTROLS) {
      if(await page.locator('#background-mute').getAttribute('aria-pressed')!=='true')throw new Error('New player should be muted');
      await page.locator('#hidebtn').click();
      if(await page.locator('.cm-content').isVisible()||await page.locator('#background-time').isVisible())throw new Error('Eye should hide text');
      const veiledTime=await videoFrame.evaluate(()=>document.querySelector('video').currentTime);
      await videoFrame.waitForFunction(time=>{const video=document.querySelector('video');return !video.paused&&video.currentTime>time+.5;},veiledTime);
      await page.screenshot({path:path.resolve(__dirname,'../test-results/extension-veiled.png')});
      await page.locator('#hidebtn').click();
      await page.locator('#background-play').click();
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.paused===true);
      await page.locator('#background-play').click();
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.paused===false);
      await page.locator('#background-volume').fill('35');await page.locator('#background-volume').dispatchEvent('change');
      await videoFrame.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.muted&&Math.abs(video.volume-.35)<.02;});
      await page.locator('#background-mute').click();
      await videoFrame.waitForFunction(()=>{const video=document.querySelector('video');return video&&!video.muted&&Math.abs(video.volume-.35)<.02;});
      const second=await context.newPage();await second.goto(pageURL);await second.locator('.cm-content').waitFor();
      // Headless Chrome keeps its pages visible. Emulate visibility changes while
      // checking the real video's playback and mute state, not a mocked player.
      const visibility = async (target,hidden) => target.evaluate(hidden=>{
        Object.defineProperty(document,'hidden',{configurable:true,value:hidden});
        Object.defineProperty(document,'visibilityState',{configurable:true,value:hidden?'hidden':'visible'});
        document.dispatchEvent(new Event('visibilitychange'));
      },hidden);
      await visibility(page,true);
      const backgroundTime=await videoFrame.evaluate(()=>document.querySelector('video').currentTime);
      await videoFrame.waitForFunction(time=>{const video=document.querySelector('video');return !video.paused&&!video.muted&&video.currentTime>time+1;},backgroundTime);
      const secondVideo=second.frames().find(frame=>frame.url().startsWith('https://www.youtube-nocookie.com/embed/'));
      await secondVideo.waitForFunction(()=>document.querySelector('video')?.muted===true);
      if(await second.locator('#background-volume').inputValue()!=='35')throw new Error('New tab should remember volume');
      await second.locator('#background-volume').fill('45');await second.locator('#background-volume').dispatchEvent('change');
      await secondVideo.waitForFunction(()=>document.querySelector('video')?.muted===true);
      await videoFrame.waitForFunction(()=>{const video=document.querySelector('video');return !video.paused&&!video.muted&&Math.abs(video.volume-.45)<.02;});
      await visibility(page,false);await visibility(second,true);
      await secondVideo.waitForFunction(()=>document.querySelector('video')?.paused===true);
      await second.close();
      await page.locator('#background-volume').fill('35');await page.locator('#background-volume').dispatchEvent('change');
      await page.locator('#background-mute').click();
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.muted===true);
      await page.locator('#background-mute').click();
      for(const seconds of [60,120]) {
        await page.locator('#background-seek').fill(String(seconds));await page.locator('#background-seek').dispatchEvent('change');
        await videoFrame.waitForFunction(seconds=>Math.abs(document.querySelector('video').currentTime-seconds)<5,seconds);
      }
      await page.waitForFunction(()=>+document.querySelector('#background-seek').value>=118);
      await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Playing');
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.paused===false);
      await page.locator('#background-play').click();
      await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Paused');
      await videoFrame.waitForFunction(()=>document.querySelector('video')?.paused===true);
      await page.screenshot({path:path.resolve(__dirname,'../test-results/extension-player.png')});
      await page.close();
      page=await context.newPage();await page.goto(pageURL);await page.locator('.cm-content').waitFor();
      await page.waitForFunction(()=>document.querySelector('#background-status').textContent==='Playing');
      const resumed=page.frames().find(frame=>frame.url().startsWith('https://www.youtube-nocookie.com/embed/'));
      await resumed.waitForFunction(()=>{const video=document.querySelector('video');return video&&!video.paused&&video.muted&&video.currentTime>=115;});
      if(await page.locator('#background-mute').getAttribute('aria-pressed')!=='true'||await page.locator('#background-volume').inputValue()!=='35')throw new Error('Reopened player should be muted with saved volume');
      console.log('PASS: text veil keeps video playing, unfocused audio continues, mute is per-tab, saved volume, pause/seek/resume');
    }
    await page.locator('#workspacesettingsbtn').click();
    }
  }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
