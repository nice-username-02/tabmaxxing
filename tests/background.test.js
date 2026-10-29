import {test} from 'node:test';
import assert from 'node:assert/strict';
import {youtubeID, cleanBackground, embedURL, scenes} from '../src/background-core.js';
test('accepts YouTube URL forms without accepting unrelated hosts', () => {
  for (const value of ['c0_ejQQcrwI','https://www.youtube.com/watch?v=c0_ejQQcrwI&t=32s','https://youtu.be/c0_ejQQcrwI','https://m.youtube.com/watch?v=c0_ejQQcrwI','https://www.youtube.com/shorts/c0_ejQQcrwI','https://www.youtube.com/live/c0_ejQQcrwI']) assert.equal(youtubeID(value), 'c0_ejQQcrwI');
  for (const value of ['https://youtube.com.evil.test/watch?v=c0_ejQQcrwI','javascript:alert(1)','https://youtube.com/playlist?list=test','bad']) assert.throws(() => youtubeID(value));
});
test('sanitises preferences and constructs muted, looping embeds', () => {
  const preferences = cleanBackground({video: 'c0_ejQQcrwI', panelOpacity: 999, blur: -5});
  assert.equal(preferences.panelOpacity, 100); assert.equal(preferences.mode, 'video'); assert.equal(preferences.blur, 0); assert.equal(preferences.muted, true);
  const url = new URL(embedURL(preferences, 'chrome-extension://example'));
  assert.equal(url.origin, 'https://www.youtube-nocookie.com');
  assert.equal(url.searchParams.get('playlist'), preferences.video); assert.equal(url.searchParams.get('loop'), '1');
  assert.equal(url.searchParams.get('mute'), '1'); assert.equal(url.searchParams.get('origin'), 'chrome-extension://example');
  assert.ok(scenes.every(scene => /^[\w-]{11}$/.test(scene.video)));
  assert.equal(cleanBackground({video:'<script>'}).video,'');
});
test('retired presets migrate while pasted custom links are preserved', () => {
  const preferences=cleanBackground({video:'c0_ejQQcrwI',creator:'Calmed By Nature',muted:false,panelOpacity:73,blur:4});
  assert.equal(preferences.video,'5Cd5-S4zUBk');assert.equal(preferences.creator,'Smooth Jazz BGM');
  assert.equal(preferences.panelOpacity,73);assert.equal(preferences.muted,false);assert.equal(preferences.blur,4);
  assert.equal(cleanBackground({video:'c0_ejQQcrwI',name:'Custom YouTube video'}).video,'c0_ejQQcrwI');
  assert.equal(cleanBackground({video:'gaGrHUekGrc',name:'Morning coffee shop',creator:'Nomadic Ambience'}).video,'5Cd5-S4zUBk');
  assert.equal(cleanBackground({video:'gaGrHUekGrc',name:'Custom YouTube video'}).video,'gaGrHUekGrc');
  assert.ok(scenes.every(scene=>scene.creator!=='Calmed By Nature'));
});

test('updated scene names and videos replace saved preset metadata', () => {
  const cafe = cleanBackground({video:'5Cd5-S4zUBk',name:'Morning coffee shop',creator:'Nomadic Ambience',volume:33,paused:true});
  assert.equal(cafe.name,'Christmas café · jazz & fireplace');
  assert.equal(cafe.creator,'Smooth Jazz BGM');
  assert.equal(cafe.volume,33); assert.equal(cafe.paused,true);
  const lofi = cleanBackground({video:'X4VbdwhkE10',name:'Lofi study room',creator:'Lofi Girl'});
  assert.equal(lofi.video,'-FlxM_0S2lA');
  assert.equal(lofi.name,'Best of lofi 2018 · chill & study');
  assert.equal(cleanBackground({video:'X4VbdwhkE10',name:'Custom YouTube video'}).video,'X4VbdwhkE10');
  assert.equal(cleanBackground({video:'5Cd5-S4zUBk',name:'My Christmas music'}).name,'My Christmas music');
  assert.equal(cleanBackground({video:'_iPgznUNWbU',name:'Gentle waves · Greek cove',creator:'TheSilentWatcher'}).name,'Gentle ocean waves');
});
test('groups all scenes in Cafe, Scenic, Abstract order', () => {
  const categories = scenes.map(scene => scene.category);
  assert.deepEqual([...new Set(categories)], ['Cafe', 'Scenic', 'Abstract']);
  assert.deepEqual(categories, [...categories].sort((a,b) => ['Cafe','Scenic','Abstract'].indexOf(a) - ['Cafe','Scenic','Abstract'].indexOf(b)));
});

test('replaces saved Flux presets with particles while preserving custom Flux links', () => {
  for (const creator of ['sandydoo', 'Sander Melnikov']) {
    const result = cleanBackground({video:'dURktAeZDa8',name:'Flux · flowing particles',creator,volume:27,blur:5,paused:true});
    assert.equal(result.video,'gx7KLCC7eKY');
    assert.equal(result.name,'Colourful sliding particles');
    assert.equal(result.creator,'Music Vibes');
    assert.equal(result.volume,27); assert.equal(result.blur,5); assert.equal(result.paused,true);
  }
  assert.equal(cleanBackground({video:'dURktAeZDa8',name:'Custom YouTube video'}).video,'dURktAeZDa8');
  assert.ok(!scenes.some(scene => scene.video === 'dURktAeZDa8'));
  for (const video of ['gx7KLCC7eKY','pUWCnazcsbU','hKckckhpbYY']) {
    assert.equal(scenes.filter(scene => scene.video === video && scene.category === 'Abstract').length,1);
  }
});
test('clamps volume and adds a safe resume offset to embeds', () => {
  assert.equal(cleanBackground({volume:120}).volume,100);
  assert.equal(cleanBackground({volume:-20}).volume,0);
  assert.equal(cleanBackground({}).volume,50);
  const url = new URL(embedURL(cleanBackground({video:scenes[0].video}), 'chrome-extension://example', 125.8));
  assert.equal(url.searchParams.get('start'),'125');
  assert.equal(new URL(embedURL(cleanBackground(), 'chrome-extension://example', NaN)).searchParams.has('start'),false);
});
