"use strict";

const QUESTIONS=window.PREGUNTAS;
const SIGNALS=window.SENALES;
const CLASSES=window.CLASES;
const PROFILES=window.PERFILES;
const CORE=window.LicenciaCore;
const STORAGE_KEY="licencia-chile-v2";
const THEME_KEY="licencia-chile-theme";
const CLASS_IDS=CLASSES.map(item=>item.id);
const LETTERS=["A","B","C","D"];
const CHECKLIST=[
  ["Contacta a tu Dirección de Tránsito","Confirma requisitos, disponibilidad, documentos, costo y plazos de reexamen."],
  ["Reúne la documentación","La cédula y los antecedentes exigidos varían según comuna y tipo de licencia."],
  ["Rinde médico, sensométrico e idoneidad","Declara tu estado de salud y usa las ayudas visuales correctoras que necesites."],
  ["Estudia el libro y practica","Usa el material oficial de CONASET y esta app como apoyo original."],
  ["Rinde el examen teórico","El formato y el puntaje dependen de la clase; verifica el sistema municipal."],
  ["Rinde el examen práctico","Conduce con seguridad y sigue las indicaciones del evaluador."],
  ["Completa el trámite","La entrega, el costo final y la vigencia dependen de la municipalidad."]
];

let state=loadState();
let exam=emptyExam();
let practice={list:[],index:0,correct:0,answered:false,finished:false,counted:false};
let currentView="inicio";
let selectedTopic="todas";
let signalFilter="todas";
let installPrompt=null;
let toastTimer=null;
let updateWorker=null;
let hadServiceWorkerController=Boolean(navigator.serviceWorker?.controller);

function byId(id){
  return document.getElementById(id);
}

function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed&&!parsed.classId&&parsed.clase)parsed.classId=parsed.clase;
    return CORE.normalizeState(parsed,CLASS_IDS);
  }catch(error){
    return CORE.normalizeState(null,CLASS_IDS);
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  }catch(error){
    showToast("No se pudo guardar el progreso en este dispositivo.");
  }
}

function emptyExam(){
  return {list:[],answers:{},index:0,active:false,finished:false,profile:null,deadline:null,timer:null,timeExpired:false};
}

function currentClass(){
  return CLASSES.find(item=>item.id===state.classId)||CLASSES[0];
}

function currentProfile(classId=state.classId){
  return CORE.profileFor(classId,PROFILES);
}

function formatTime(seconds){
  const safe=Math.max(0,seconds);
  const minutes=Math.floor(safe/60);
  const rest=safe%60;
  return `${String(minutes).padStart(2,"0")}:${String(rest).padStart(2,"0")}`;
}

function setText(id,value){
  const element=byId(id);
  if(element)element.textContent=value;
}

function showToast(message){
  const toast=byId("toast");
  toast.textContent=message;
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast.hidden=true;},3200);
}

function createElement(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
}

function clear(element){
  element.replaceChildren();
}

function touchDay(){
  const today=CORE.dateKey();
  if(state.lastDay===today)return;
  state.streak=state.lastDay===CORE.previousDateKey()?state.streak+1:1;
  state.lastDay=today;
}

function addXP(amount){
  touchDay();
  state.xp+=Math.max(0,amount);
  saveState();
}

function renderTop(){
  const level=Math.floor(state.xp/100)+1;
  const levelProgress=state.xp%100;
  setText("xp-label",`Nivel ${level} · ${state.xp} XP`);
  setText("streak-label",`Racha: ${state.streak} días`);
  byId("xp-fill").style.width=`${levelProgress}%`;
  byId("class-pill").textContent=`Clase ${state.classId}`;
  renderHome();
  renderProgress();
}

function renderFormatCard(element,profile){
  clear(element);
  const title=createElement("strong","format-title",profile.label);
  const note=createElement("span","format-note",profile.timeNote);
  element.append(title,note);
}

function createMetric(value,label){
  const metric=createElement("div","metric");
  metric.append(createElement("strong","",String(value)),createElement("span","",label));
  return metric;
}

function renderHome(){
  const profile=currentProfile();
  const item=currentClass();
  setText("hero-text",`Preguntas originales para la clase ${item.code}: ${item.name.toLowerCase()}.`);
  renderFormatCard(byId("hero-format"),profile);
  const metrics=byId("home-metrics");
  clear(metrics);
  metrics.append(
    createMetric(state.examenes,"simulacros"),
    createMetric(state.passed,"aprobados"),
    createMetric(state.best,"mejor %"),
    createMetric(state.practice,"prácticas")
  );
  const learned=Object.values(state.signals).filter(Boolean).length;
  const percent=SIGNALS.length?Math.round(learned/SIGNALS.length*100):0;
  setText("signal-mastery",`${percent}%`);
  byId("signal-fill").style.width=`${percent}%`;
  setText("daily-status",state.practice?"Ronda completada":"Empieza ahora");
}

function renderProgress(){
  const metrics=byId("progress-metrics");
  if(!metrics)return;
  clear(metrics);
  metrics.append(
    createMetric(state.examenes,"exámenes"),
    createMetric(state.passed,"aprobados"),
    createMetric(state.best,"mejor %"),
    createMetric(state.errorIds.length,"preguntas pendientes"),
    createMetric(state.xp,"XP total"),
    createMetric(state.streak,"días de racha")
  );
  const weak=byId("weak-topics");
  clear(weak);
  const entries=Object.entries(state.topicErrors).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!entries.length){
    weak.append(createElement("p","empty-state","Todavía no hay errores registrados. Practica o rinde un simulacro."));
  }else{
    entries.forEach(([topic,count])=>{
      const button=createElement("button","topic-row");
      button.type="button";
      button.append(createElement("span","",topic),createElement("strong","",`${count} fallo${count===1?"":"s"}`));
      button.addEventListener("click",()=>{selectedTopic=topic;renderTopics();startPractice(false);});
      weak.append(button);
    });
  }
}

function renderTopics(){
  const topics=[...new Set(CORE.poolFor(QUESTIONS,state.classId).map(question=>question.tema))].sort((a,b)=>a.localeCompare(b,"es"));
  if(selectedTopic!=="todas"&&!topics.includes(selectedTopic))selectedTopic="todas";
  [byId("practice-topic"),byId("practice-topic-page")].forEach(select=>{
    clear(select);
    const all=createElement("option","", "Todos los temas");
    all.value="todas";
    select.append(all);
    topics.forEach(topic=>{
      const option=createElement("option","",topic);
      option.value=topic;
      select.append(option);
    });
    select.value=selectedTopic;
  });
}

function renderClasses(){
  const tabs=byId("class-tabs");
  clear(tabs);
  CLASSES.forEach(item=>{
    const button=createElement("button","class-tab",item.code);
    button.type="button";
    button.setAttribute("role","tab");
    button.setAttribute("aria-selected",String(item.id===state.classId));
    button.classList.toggle("active",item.id===state.classId);
    button.addEventListener("click",()=>setClass(item.id));
    tabs.append(button);
  });
  renderClassDetail();
}

function renderClassDetail(){
  const item=currentClass();
  const profile=currentProfile();
  const detail=byId("class-detail");
  clear(detail);
  const card=createElement("article","class-card");
  const heading=createElement("div","class-heading");
  const code=createElement("span","class-code",item.code);
  const title=createElement("div");
  title.append(createElement("h2","",`Clase ${item.code}: ${item.name}`),createElement("p","class-kicker",item.age));
  heading.append(code,title);
  const vehicle=createElement("section","class-section");
  vehicle.append(createElement("h3","","Qué habilita"),createElement("p","",item.vehicle));
  const requirements=createElement("section","class-section");
  const list=createElement("ul","requirement-list");
  item.requirements.forEach(requirement=>list.append(createElement("li","",requirement)));
  requirements.append(createElement("h3","","Requisitos principales"),list);
  const format=createElement("div","class-format");
  renderFormatCard(format,profile);
  const actions=createElement("div","button-row");
  const examButton=createElement("button","button button-primary","Rendir simulacro");
  examButton.type="button";
  examButton.addEventListener("click",startExam);
  const source=createElement("a","button button-ghost","Fuente oficial");
  source.href=item.source;
  source.target="_blank";
  source.rel="noopener";
  actions.append(examButton,source);
  const tip=createElement("div","tip-box");
  tip.append(createElement("strong","","Importante"),createElement("p","",item.tip));
  card.append(heading,vehicle,requirements,format,tip,actions);
  detail.append(card);
}

function setClass(classId){
  if(!CLASS_IDS.includes(classId)||classId===state.classId)return;
  if(exam.active)stopExam();
  state.classId=classId;
  selectedTopic="todas";
  saveState();
  renderTop();
  renderTopics();
  renderClasses();
  showToast(`Clase ${classId} seleccionada.`);
}

function showView(name,{focus=true,updateHash=true}={}){
  if(!byId(`view-${name}`))name="inicio";
  if(currentView==="examen"&&name!=="examen"&&exam.active&&!exam.finished)stopExam();
  currentView=name;
  document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===`view-${name}`));
  document.querySelectorAll(".tabbar button").forEach(button=>{
    const tabName=button.dataset.view||(button.dataset.action==="open-exam"?"examen":"");
    const active=tabName===name;
    button.classList.toggle("active",active);
    if(active)button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  });
  if(updateHash&&location.hash!==`#${name}`)history.pushState({view:name},"",`#${name}`);
  if(name==="classes")renderClasses();
  if(name==="exam")renderExamIntro();
  if(name==="signals")renderSignals();
  if(name==="tramite")renderChecklist();
  if(name==="progress")renderProgress();
  if(focus){
    const heading=byId(`view-${name}`).querySelector("h1");
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
  window.scrollTo({top:0,behavior:"auto"});
}

function startExam(){
  const profile=currentProfile();
  const list=CORE.buildExam(QUESTIONS,state.classId,PROFILES);
  if(!list.length){showToast("No hay preguntas disponibles para esta clase.");return}
  exam={list,answers:{},index:0,active:true,finished:false,profile,deadline:profile.seconds?Date.now()+profile.seconds*1000:null,timer:null,timeExpired:false};
  byId("exam-empty").hidden=true;
  byId("exam-active").hidden=false;
  byId("exam-result").hidden=true;
  clear(byId("exam-result"));
  showView("examen",{focus:false});
  renderExam();
  if(exam.deadline)exam.timer=setInterval(tickExam,250);
}

function renderExamIntro(){
  const item=currentClass();
  const profile=currentProfile();
  setText("exam-class-title",`Simulador de clase ${item.code}`);
  setText("exam-class-description",`El set de preguntas se selecciona para ${item.name.toLowerCase()}. Puedes cambiar de clase en cualquier momento.`);
  renderFormatCard(byId("exam-format"),profile);
  byId("exam-empty").hidden=exam.active;
  byId("exam-active").hidden=!exam.active;
}

function renderExam(){
  if(!exam.active||!exam.list.length)return;
  const question=exam.list[exam.index];
  const answered=Object.keys(exam.answers).length;
  const unanswered=exam.list.length-answered;
  setText("exam-class-chip",`Clase ${state.classId}`);
  setText("exam-note",`${exam.list.length} preguntas`);
  setText("exam-status",`${answered} contestadas · ${unanswered} pendientes`);
  byId("exam-progress").style.width=`${Math.round(answered/exam.list.length*100)}%`;
  renderTimer();
  const nav=byId("question-nav");
  clear(nav);
  exam.list.forEach((item,index)=>{
    const button=createElement("button","",String(index+1));
    button.type="button";
    button.classList.toggle("answered",exam.answers[item.id]!==undefined);
    button.classList.toggle("current",index===exam.index);
    if(index===exam.index)button.setAttribute("aria-current","step");
    button.disabled=exam.finished;
    button.addEventListener("click",()=>goExam(index));
    nav.append(button);
  });
  const meta=byId("question-meta");
  clear(meta);
  meta.append(createElement("span","question-topic",question.tema),createElement("span","points-chip",question.doble?"2 puntos":"1 punto"));
  setText("question-text",question.q);
  const options=byId("question-options");
  clear(options);
  question.ops.forEach((text,index)=>{
    const button=createElement("button","option");
    button.type="button";
    button.append(createElement("span","option-letter",LETTERS[index]),createElement("span","option-text",text));
    button.classList.toggle("selected",exam.answers[question.id]===index);
    button.setAttribute("aria-pressed",String(exam.answers[question.id]===index));
    button.disabled=exam.finished;
    button.addEventListener("click",()=>answerExam(question.id,index));
    options.append(button);
  });
  byId("exam-timer").classList.toggle("warning",Boolean(exam.deadline&&exam.deadline-Date.now()<300000));
  const finish=document.querySelector('[data-action="finish-exam"]');
  finish.disabled=exam.finished;
  finish.textContent=exam.finished?"Examen terminado":`Terminar y ver resultado${unanswered?` · ${unanswered} pendientes`:""}`;
}

function answerExam(id,answer){
  if(exam.finished)return;
  exam.answers[id]=answer;
  renderExam();
}

function goExam(index){
  if(exam.finished)return;
  exam.index=Math.min(exam.list.length-1,Math.max(0,index));
  renderExam();
  document.querySelector(".question-card").scrollIntoView({behavior:"smooth",block:"start"});
}

function renderTimer(){
  const timer=byId("exam-timer");
  if(!exam.deadline){timer.textContent="Sin límite";timer.classList.remove("warning");return}
  const remaining=Math.max(0,Math.ceil((exam.deadline-Date.now())/1000));
  timer.textContent=formatTime(remaining);
  timer.classList.toggle("warning",remaining<300);
  timer.setAttribute("aria-label",`${formatTime(remaining)} restantes`);
}

function tickExam(){
  if(!exam.active||exam.finished||!exam.deadline)return;
  if(Date.now()>=exam.deadline){finishExam(true);return}
  renderTimer();
}

function finishExam(timeExpired=false){
  if(!exam.active||exam.finished)return;
  exam.timeExpired=Boolean(timeExpired);
  exam.finished=true;
  if(exam.timer){clearInterval(exam.timer);exam.timer=null}
  const result=CORE.scoreExam(exam.list,exam.answers,exam.profile,exam.timeExpired);
  state.exams+=1;
  if(result.pass===true)state.passed+=1;
  state.best=Math.max(state.best,result.percent);
  exam.list.forEach(question=>{
    const answer=exam.answers[question.id];
    if(answer===undefined||answer!==question.ok){
      if(!state.errorIds.includes(question.id))state.errorIds.push(question.id);
      state.topicErrors[question.tema]=(state.topicErrors[question.tema]||0)+1;
    }else{
      state.errorIds=state.errorIds.filter(id=>id!==question.id);
      state.topicErrors[question.tema]=Math.max(0,(state.topicErrors[question.tema]||0)-1);
      if(state.topicErrors[question.tema]===0)delete state.topicErrors[question.tema];
    }
  });
  addXP(result.studyPassed?35:12);
  renderExamResult(result);
  renderExam();
  saveState();
  renderTop();
  byId("exam-result").scrollIntoView({behavior:"smooth",block:"start"});
}

function renderExamResult(result){
  const resultCard=byId("exam-result");
  clear(resultCard);
  resultCard.hidden=false;
  const title=result.pass===true?"Examen aprobado":result.pass===false?"Examen reprobado":result.studyPassed?"Meta de estudio cumplida":"Meta de estudio pendiente";
  resultCard.append(createElement("span","eyebrow",`Clase ${state.classId}`),createElement("h2","result-title",title));
  const score=createElement("div","score-line");
  score.append(createElement("strong","",`${result.score}/${result.max}`),createElement("span","",`${result.percent}%`));
  resultCard.append(score);
  if(result.timeExpired)resultCard.append(createElement("p","warning-text","El tiempo terminó antes de que confirmaras todas las respuestas."));
  const summary=createElement("div","result-metrics");
  summary.append(createMetric(result.correct,"correctas"),createMetric(result.wrong,"incorrectas"),createMetric(result.unanswered,"sin responder"));
  resultCard.append(summary);
  const note=createElement("p","result-note",typeof result.pass==="boolean"?"Este puntaje corresponde al formato modelado para la clase elegida.":"Meta orientativa de esta app; consulta el corte de aprobado de tu municipalidad.");
  resultCard.append(note);
  const titleRow=createElement("h3","review-title","Revisión pregunta por pregunta");
  resultCard.append(titleRow);
  exam.list.forEach((question,index)=>{
    const answer=exam.answers[question.id];
    const correct=answer===question.ok;
    const details=document.createElement("details");
    details.className="review-item";
    if(!correct)details.open=true;
    const summaryNode=document.createElement("summary");
    summaryNode.append(createElement("span","review-status",correct?"Correcta":"Revisar"),createElement("span","",`${index+1}. ${question.q}`));
    const answerText=answer===undefined?"Sin responder":question.ops[answer];
    const body=createElement("div","review-body");
    body.append(createElement("p","",`Tu respuesta: ${answerText}`),createElement("p","correct-answer","Correcta: "+question.ops[question.ok]),createElement("p","explanation",question.exp));
    details.append(summaryNode,body);
    resultCard.append(details);
  });
  const repeat=createElement("button","button button-primary","Rendir otro simulacro");
  repeat.type="button";
  repeat.addEventListener("click",startExam);
  resultCard.append(repeat);
}

function stopExam(){
  if(exam.timer){clearInterval(exam.timer);exam.timer=null}
  exam=emptyExam();
  byId("exam-active").hidden=true;
  byId("exam-empty").hidden=false;
  byId("exam-result").hidden=true;
}

function exitExam(){
  const answered=Object.keys(exam.answers).length;
  if(exam.active&&!exam.finished&&answered>0&&!confirm("El simulacro actual se cerrará y no se guardará. ¿Continuar?"))return;
  stopExam();
  showView("inicio");
}

function startPractice(weak=false){
  let pool=CORE.poolFor(QUESTIONS,state.classId);
  if(weak){
    const failed=new Set(state.errorIds);
    pool=pool.filter(question=>failed.has(question.id));
    if(!pool.length){showToast("No tienes preguntas falladas. Comienza una ronda normal.");return}
  }else if(selectedTopic!=="todas"){
    pool=pool.filter(question=>question.tema===selectedTopic);
  }
  const list=CORE.shuffle(pool).slice(0,10);
  if(!list.length){showToast("No hay preguntas para este filtro.");return}
  practice={list,index:0,correct:0,answered:false,finished:false,counted:false};
  byId("practice-active").hidden=false;
  showView("practica",{focus:false});
  renderPractice();
}

function renderPractice(){
  if(!practice.list.length)return;
  const question=practice.list[practice.index];
  const complete=practice.finished;
  setText("practice-status",complete?`${practice.correct}/${practice.list.length} correctas`:`${practice.index+1}/${practice.list.length}`);
  byId("practice-progress").style.width=`${Math.round((practice.index+(practice.answered?1:0))/practice.list.length*100)}%`;
  setText("practice-meta",`${question.tema} · 1 punto`);
  setText("practice-question",question.q);
  const options=byId("practice-options");
  clear(options);
  if(complete){
    const message=createElement("div","practice-complete");
    message.append(createElement("strong","",`${practice.correct} de ${practice.list.length}`),createElement("p","",practice.correct>=8?"Muy buen resultado. Revisa los detalles y vuelve a intentarlo.":"Repasa las explicaciones y practica de nuevo los temas pendientes."));
    options.append(message);
  }else{
    question.ops.forEach((text,index)=>{
      const button=createElement("button","option");
      button.type="button";
      button.append(createElement("span","option-letter",LETTERS[index]),createElement("span","option-text",text));
      button.disabled=practice.answered;
      if(practice.answered){
        if(index===question.ok)button.classList.add("correct");
        if(index===practice.options.selected&&index!==question.ok)button.classList.add("incorrect");
      }
      button.addEventListener("click",()=>answerPractice(index));
      options.append(button);
    });
  }
  const feedback=byId("practice-feedback");
  clear(feedback);
  if(practice.answered){
    const selected=practice.options?.selected;
    const correct=selected===question.ok;
    feedback.className=`feedback ${correct?"correct":"incorrect"}`;
    feedback.append(createElement("strong","",correct?"Respuesta correcta":"Respuesta incorrecta"),createElement("p","",question.exp));
  }
  const next=document.querySelector('[data-action="practice-next"]');
  next.textContent=complete?"Practicar otra ronda":practice.index===practice.list.length-1?"Ver resultado":"Siguiente pregunta";
  next.disabled=!practice.answered&&!complete;
}

function answerPractice(answer){
  if(practice.answered||practice.finished)return;
  const question=practice.list[practice.index];
  practice.answered=true;
  practice.options={selected:answer};
  practice.counted=true;
  state.practice+=1;
  if(answer===question.ok){
    practice.correct+=1;
    state.correct+=1;
    state.errorIds=state.errorIds.filter(id=>id!==question.id);
    state.topicErrors[question.tema]=Math.max(0,(state.topicErrors[question.tema]||0)-1);
    if(state.topicErrors[question.tema]===0)delete state.topicErrors[question.tema];
    addXP(2);
  }else{
    if(!state.errorIds.includes(question.id))state.errorIds.push(question.id);
    state.topicErrors[question.tema]=(state.topicErrors[question.tema]||0)+1;
  }
  saveState();
  renderPractice();
  renderTop();
}

function nextPractice(){
  if(practice.finished){startPractice(false);return}
  if(!practice.answered)return;
  if(practice.index===practice.list.length-1){
    practice.finished=true;
  }else{
    practice.index+=1;
    practice.answered=false;
    practice.options=null;
  }
  renderPractice();
}

function renderSignalFilters(){
  const filters=["todas","Reglamentaria","Preventiva","Informativa"];
  const container=byId("signal-filters");
  clear(container);
  filters.forEach(filter=>{
    const button=createElement("button","filter-chip",filter==="todas"?"Todas":`${filter}s`);
    button.type="button";
    button.classList.toggle("active",filter===signalFilter);
    button.addEventListener("click",()=>{signalFilter=filter;renderSignals();});
    container.append(button);
  });
}

function renderSignals(){
  renderSignalFilters();
  const items=SIGNALS.filter(item=>signalFilter==="todas"||item.t===signalFilter);
  const grid=byId("signal-grid");
  clear(grid);
  items.forEach(item=>{
    const card=createElement("article","signal-card");
    const top=createElement("div","signal-top");
    top.append(createElement("span","signal-code",item.code),createElement("span","signal-type",item.t));
    const title=createElement("h2","",item.n);
    const description=createElement("p","signal-description",item.d);
    description.hidden=true;
    const reveal=createElement("button","button button-ghost button-small","Ver significado");
    reveal.type="button";
    reveal.setAttribute("aria-expanded","false");
    reveal.addEventListener("click",()=>{
      const open=!description.hidden;
      description.hidden=open;
      reveal.setAttribute("aria-expanded",String(!open));
      reveal.textContent=open?"Ver significado":"Ocultar";
    });
    const known=createElement("button","known-button",state.signals[item.code]?"Aprendida":"Marcar como aprendida");
    known.type="button";
    known.classList.toggle("known",Boolean(state.signals[item.code]));
    known.addEventListener("click",()=>{
      state.signals[item.code]=!state.signals[item.code];
      if(state.signals[item.code])addXP(1);
      saveState();
      renderSignals();
      renderTop();
    });
    card.append(top,title,description,reveal,known);
    grid.append(card);
  });
  const learned=Object.values(state.signals).filter(Boolean).length;
  const percent=Math.round(learned/SIGNALS.length*100);
  setText("signal-count",`${learned} de ${SIGNALS.length} aprendidas`);
  setText("signal-percent",`${percent}%`);
  byId("signal-progress").style.width=`${percent}%`;
}

function renderChecklist(){
  const container=byId("checklist");
  clear(container);
  CHECKLIST.forEach((item,index)=>{
    const label=createElement("label","check-item");
    const input=document.createElement("input");
    input.type="checkbox";
    input.checked=Boolean(state.checklist[index]);
    input.addEventListener("change",()=>{
      state.checklist[index]=input.checked;
      saveState();
      renderChecklist();
    });
    const content=createElement("span");
    content.append(createElement("strong","",`${index+1}. ${item[0]}`),createElement("small","",item[1]));
    label.append(input,content);
    container.append(label);
  });
  const done=CHECKLIST.filter((_,index)=>state.checklist[index]).length;
  const percent=Math.round(done/CHECKLIST.length*100);
  setText("checklist-percent",`${percent}%`);
  byId("checklist-progress").style.width=`${percent}%`;
}

function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="licencia-chile-progreso.json";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast("Progreso exportado.");
}

async function importData(file){
  if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());
    state=CORE.normalizeState(parsed,CLASS_IDS);
    saveState();
    selectedTopic="todas";
    renderAll();
    showToast("Progreso importado correctamente.");
  }catch(error){
    showToast("El archivo no contiene un progreso válido.");
  }finally{
    byId("import-file").value="";
  }
}

function resetData(){
  if(!confirm("Se borrarán todos los puntos, racha, errores y checklists de este dispositivo. ¿Continuar?"))return;
  state=CORE.normalizeState(null,CLASS_IDS);
  stopExam();
  saveState();
  renderAll();
  showToast("Progreso borrado.");
}

function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem(THEME_KEY,theme)}catch(error){}
  setText("theme-toggle",theme==="dark"?"Claro":"Oscuro");
}

function renderNetwork(){
  const online=navigator.onLine;
  setText("network-status",online?"En línea":"Sin conexión");
  byId("network-status").classList.toggle("offline",!online);
}

function showUpdate(worker){
  updateWorker=worker;
  byId("update-banner").hidden=false;
}

async function registerServiceWorker(){
  if(!("serviceWorker" in navigator)||!["https:","http:"].includes(location.protocol))return;
  try{
    const registration=await navigator.serviceWorker.register("./sw.js");
    if(registration.waiting)showUpdate(registration.waiting);
    registration.addEventListener("updatefound",()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener("statechange",()=>{
        if(worker.state==="installed"&&navigator.serviceWorker.controller)showUpdate(worker);
      });
    });
    setInterval(()=>registration.update(),3600000);
  }catch(error){
    return;
  }
}

function renderAll(){
  renderTop();
  renderTopics();
  renderClasses();
  renderExamIntro();
  renderSignals();
  renderChecklist();
  renderNetwork();
}

async function handleAction(action){
  if(action==="toggle-theme")applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");
  if(action==="show-classes")showView("clases");
  if(action==="start-exam")startExam();
  if(action==="open-exam")showView("examen");
  if(action==="exit-exam")exitExam();
  if(action==="exam-prev")goExam(exam.index-1);
  if(action==="exam-next")goExam(exam.index+1);
  if(action==="finish-exam"){
    const unanswered=exam.list.length-Object.keys(exam.answers).length;
    if(unanswered&&!confirm(`Quedan ${unanswered} preguntas sin responder. ¿Terminar ahora?`))return;
    finishExam(false);
  }
  if(action==="start-practice")startPractice(false);
  if(action==="start-weak")startPractice(true);
  if(action==="practice-next")nextPractice();
  if(action==="export-data")exportData();
  if(action==="import-data")byId("import-file").click();
  if(action==="reset-data")resetData();
  if(action==="install-app"&&installPrompt){
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt=null;
    byId("install-banner").hidden=true;
  }
  if(action==="dismiss-install")byId("install-banner").hidden=true;
  if(action==="apply-update"){
    byId("update-banner").hidden=true;
    if(updateWorker){updateWorker.postMessage({type:"SKIP_WAITING"});updateWorker=null}
  }
}

document.addEventListener("click",event=>{
  const viewButton=event.target.closest("[data-view]");
  if(viewButton){event.preventDefault();showView(viewButton.dataset.view);return}
  const actionButton=event.target.closest("[data-action]");
  if(actionButton)handleAction(actionButton.dataset.action);
});

document.addEventListener("change",event=>{
  if(event.target.id==="practice-topic"||event.target.id==="practice-topic-page"){
    selectedTopic=event.target.value;
    renderTopics();
  }
});

byId("import-file").addEventListener("change",event=>importData(event.target.files[0]));
window.addEventListener("online",renderNetwork);
window.addEventListener("offline",renderNetwork);
window.addEventListener("popstate",()=>showView(location.hash.slice(1)||"inicio",{focus:false,updateHash:false}));
document.addEventListener("visibilitychange",()=>{if(!document.hidden)tickExam()});
window.addEventListener("storage",event=>{
  if(event.key!==STORAGE_KEY)return;
  state=loadState();
  renderAll();
});
window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  installPrompt=event;
  byId("install-banner").hidden=false;
});
window.addEventListener("appinstalled",()=>{
  installPrompt=null;
  byId("install-banner").hidden=true;
  showToast("Licencia Chile quedó instalada.");
});
navigator.serviceWorker?.addEventListener("controllerchange",()=>{if(hadServiceWorkerController)location.reload()});

let savedTheme=null;
try{savedTheme=localStorage.getItem(THEME_KEY)}catch(error){}
applyTheme(savedTheme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"));
renderAll();
showView(location.hash.slice(1)||"inicio",{focus:false,updateHash:false});
registerServiceWorker();
