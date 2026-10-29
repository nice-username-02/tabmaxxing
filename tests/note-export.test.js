import {test} from 'node:test';
import assert from 'node:assert/strict';
import {noteFilename, exportSavedNotes} from '../src/note-export.js';

function fixture() {
  const data = {workspaceTabs: [{id: 'original', name: 'Notes'}], 'note:original': '# Notes\n\nHello ☕'};
  const files = [];
  const api = {storage: {local: {get: async () => structuredClone(data), set: async value => Object.assign(data, value)}}};
  const directory = {queryPermission: async () => 'granted', getFileHandle: async name => ({createWritable: async () => ({write: async text => files.push({name,text}), close: async () => {}})})};
  const getDirectory = async () => directory;
  const enable = () => { data.noteExport = {enabled:true,destination:'custom',token:'custom'}; };
  return {data,files,api,directory,getDirectory,enable};
}

test('filenames isolate duplicate note names and handle unsafe Windows names', () => {
  assert.notEqual(noteFilename({id:'a',name:'Notes'}),noteFilename({id:'b',name:'Notes'}));
  assert.equal(noteFilename({id:'a',name:'CON'}),'_CON--a.md');
  assert.equal(noteFilename({id:'a',name:'../a:b?'}),'..-a-b---a.md');
});

test('backups default off and require an explicitly selected folder, including legacy Downloads settings', async () => {
  const {data,files,api,getDirectory} = fixture();
  for (const settings of [undefined, {enabled:true}, {enabled:true,destination:'downloads'}]) {
    data.noteExport = settings;
    await exportSavedNotes(api,getDirectory);
    await exportSavedNotes(api,getDirectory,{force:true});
  }
  assert.equal(files.length,0);
  assert.equal(data.noteExportLastUpdated,undefined);
});

test('automatic writes preserve Unicode, skip unchanged notes, and re-export on destination change', async () => {
  const {data,files,api,getDirectory,enable} = fixture(); enable();
  await exportSavedNotes(api,getDirectory);
  assert.deepEqual(files,[{name:'Notes--original.md',text:data['note:original']}]);
  assert.ok(data.noteExportLastUpdated);
  data.noteExportLastUpdated = 123;
  await exportSavedNotes(api,getDirectory);
  assert.equal(files.length,1);
  assert.equal(data.noteExportLastUpdated,123);
  data['note:original'] = 'Edited';
  await exportSavedNotes(api,getDirectory);
  assert.equal(files[1].text,'Edited');
  assert.equal(files[1].name,files[0].name);
  data.noteExport.token = 'another folder';
  await exportSavedNotes(api,getDirectory); assert.equal(files.length,3);
  assert.equal(data.noteExportStatus.ok,true);
});

test('manual update writes unchanged backups even when automatic backups are disabled', async () => {
  const {data,files,api,getDirectory,enable} = fixture(); enable();
  data.noteExport.enabled = false;
  await exportSavedNotes(api,getDirectory); assert.equal(files.length,0);
  await exportSavedNotes(api,getDirectory,{force:true}); assert.equal(files.length,1);
  data.noteExportLastUpdated = 123;
  await exportSavedNotes(api,getDirectory,{force:true}); assert.equal(files.length,2);
  assert.ok(data.noteExportLastUpdated > 123);
  assert.equal(data.noteExport.enabled,false);
});

test('permission and write failures preserve the last successful timestamp and allow retry', async () => {
  const {data,files,api,directory,getDirectory,enable} = fixture(); enable();
  data.noteExportLastUpdated = 123;
  await assert.rejects(exportSavedNotes(api,async () => ({queryPermission:async () => 'prompt'})),/Folder access needed/);
  await assert.rejects(exportSavedNotes(api,async () => null),/Folder access needed/);
  assert.equal(data.noteExportLastUpdated,123);
  assert.equal(data.noteExportReceipts,undefined);
  const failing = {...directory,getFileHandle:async () => ({createWritable:async () => ({write:async () => {throw new Error('Disk full');},abort:async () => {}})})};
  await assert.rejects(exportSavedNotes(api,async () => failing),/Disk full/);
  assert.equal(data.noteExportLastUpdated,123);
  await exportSavedNotes(api,getDirectory);
  assert.equal(files.length,1);
  assert.ok(data.noteExportLastUpdated > 123);
});

test('existing backups without a timestamp get a confirmed completion time even if notes are unchanged', async () => {
  const {data,files,api,getDirectory,enable} = fixture(); enable();
  await exportSavedNotes(api,getDirectory);
  delete data.noteExportLastUpdated;
  await exportSavedNotes(api,getDirectory);
  assert.equal(files.length,2);
  assert.ok(data.noteExportLastUpdated > 0);
});
