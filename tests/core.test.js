const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
global.window=global;
require("../data.js");
const core=require("../core.js");
const questions=global.PREGUNTAS;
const signals=global.SENALES;
const classes=global.CLASES;
const profiles=global.PERFILES;
const root=path.resolve(__dirname,"..");
const classIds=classes.map(item=>item.id);
const validLicenses=new Set(["B","C","CR","A","D","E","F"]);

test("el banco contiene 140 preguntas originales válidas",()=>{
  assert.equal(questions.length,140);
  assert.equal(new Set(questions.map(question=>question.id)).size,questions.length);
  for(const question of questions){
    assert.equal(typeof question.id,"number",`ID inválido: ${question.id}`);
    assert.equal(typeof question.q,"string");
    assert.ok(question.q.length>20,`Pregunta corta: ${question.id}`);
    assert.equal(question.ops.length,4,`Opciones inválidas: ${question.id}`);
    assert.equal(new Set(question.ops).size,4,`Opciones repetidas: ${question.id}`);
    assert.ok(question.ok>=0&&question.ok<4,`Respuesta inválida: ${question.id}`);
    assert.equal(typeof question.exp,"string");
    assert.ok(question.exp.length>20,`Explicación corta: ${question.id}`);
    assert.equal(typeof question.doble,"boolean");
    assert.ok(question.lic.length>0);
    assert.ok(question.lic.every(value=>validLicenses.has(value)),`Clase inválida: ${question.id}`);
    assert.doesNotMatch(`${question.q} ${question.ops.join(" ")} ${question.exp}`,/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u3040-\u30ff\u3400-\u9fff]/i);
  }
});

test("cada clase tiene preguntas suficientes para su perfil",()=>{
  for(const item of classes){
    const profile=profiles[item.id];
    const pool=core.poolFor(questions,item.id);
    assert.ok(profile,`Sin perfil: ${item.id}`);
    assert.ok(pool.length>=profile.questions,`Pool insuficiente: ${item.id}`);
    assert.ok(pool.filter(question=>question.doble).length>=profile.double,`Dobles insuficientes: ${item.id}`);
  }
});

test("los simulacros B y C contienen 35 preguntas y 3 dobles",()=>{
  for(const classId of ["B","C"]){
    const exam=core.buildExam(questions,classId,profiles,()=>0.37);
    assert.equal(exam.length,35);
    assert.equal(new Set(exam.map(question=>question.id)).size,35);
    assert.equal(exam.filter(question=>question.doble).length,3);
    const answers=Object.fromEntries(exam.map(question=>[question.id,question.ok]));
    const result=core.scoreExam(exam,answers,profiles[classId]);
    assert.equal(result.score,38);
    assert.equal(result.max,38);
    assert.equal(result.pass,true);
  }
});

test("los simulacros profesionales y CR usan 20 preguntas",()=>{
  for(const classId of ["CR","A1","A2","A3","A4","A5"]){
    const exam=core.buildExam(questions,classId,profiles,()=>0.23);
    assert.equal(exam.length,20);
    assert.equal(new Set(exam.map(question=>question.id)).size,20);
  }
});

test("el puntaje distingue 32 de 33 puntos",()=>{
  const exam=[
    {id:1,doble:true,ok:0},
    {id:2,doble:false,ok:0},
    {id:3,doble:false,ok:0}
  ];
  const profile={min:3,max:4,studyGoal:.75};
  assert.equal(core.scoreExam(exam,{1:0,2:0,3:1},profile).score,3);
  assert.equal(core.scoreExam(exam,{1:0,2:0,3:1},profile).pass,true);
  assert.equal(core.scoreExam(exam,{1:1,2:0,3:0},profile).score,2);
  assert.equal(core.scoreExam(exam,{1:1,2:0,3:0},profile).pass,false);
});

test("las respuestas sin contestar se contabilizan",()=>{
  const exam=[{id:1,doble:false,ok:1},{id:2,doble:false,ok:0}];
  const result=core.scoreExam(exam,{1:1},{},false);
  assert.equal(result.correct,1);
  assert.equal(result.unanswered,1);
  assert.equal(result.wrong,0);
});

test("el estado local se normaliza y repara",()=>{
  const state=core.normalizeState({classId:"INVALID",xp:"20",errorIds:[1,1,2,"3"],topicErrors:{a:4,b:"x"},signals:{PARE:true,OTHER:1},checklist:{"0":true,"x":true}},classIds);
  assert.equal(state.classId,"B");
  assert.equal(state.xp,0);
  assert.deepEqual(state.errorIds,[1,2]);
  assert.equal(state.topicErrors.a,4);
  assert.equal(state.topicErrors.b,undefined);
  assert.deepEqual(state.signals,{PARE:true});
  assert.deepEqual(state.checklist,{"0":true});
});

test("la fecha de racha usa America/Santiago",()=>{
  const instant=new Date("2026-09-24T01:00:00.000Z");
  assert.equal(core.dateKey(instant),"2026-09-23");
  assert.equal(core.previousDateKey(instant),"2026-09-22");
});

test("la app no usa innerHTML ni manejadores inline",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
  assert.doesNotMatch(app,/\.innerHTML\s*=/);
  assert.doesNotMatch(html,/\son[a-z]+=/i);
  assert.doesNotMatch(html,/simulador oficial/i);
});

test("el HTML contiene IDs únicos",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
});

test("el manifest y los recursos PWA son coherentes",()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
  const serviceWorker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert.equal(manifest.display,"standalone");
  assert.ok(manifest.icons.length>=3);
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,icon.src)),`Falta ${icon.src}`);
  assert.match(serviceWorker,/request\.method!=="GET"/);
  assert.match(serviceWorker,/url\.origin!==self\.location\.origin/);
  assert.match(serviceWorker,/key\.startsWith\("licencia-chile-"\)/);
});

test("el service worker no devuelve HTML para recursos",()=>{
  const serviceWorker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  const navigationStart=serviceWorker.indexOf('request.mode==="navigate"');
  const navigationEnd=serviceWorker.indexOf('event.respondWith((async()=>{',navigationStart+50);
  assert.ok(navigationStart>=0&&navigationEnd>navigationStart);
  const navigationBlock=serviceWorker.slice(navigationStart,navigationEnd);
  const assetBlock=serviceWorker.slice(navigationEnd);
  assert.match(navigationBlock,/caches\.match\("\.\/index\.html"\)/);
  assert.doesNotMatch(assetBlock,/caches\.match\("\.\/index\.html"\)/);
});
