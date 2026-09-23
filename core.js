(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.LicenciaCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const fallback={questions:20,seconds:null,min:null,max:20,double:0,studyGoal:.8};
  const classMap={A1:"A",A2:"A",A3:"A",A4:"A",A5:"A"};
  function shuffle(list,random=Math.random){
    const copy=[...list];
    for(let i=copy.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  }
  function groupFor(classId){
    if(classId==="B"||classId==="C"||classId==="CR")return classId;
    if(classMap[classId])return "A";
    if(["D","E","F"].includes(classId))return classId;
    return "B";
  }
  function poolFor(questions,classId){
    const group=groupFor(classId);
    return questions.filter(q=>{
      const classes=q.lic||[];
      if(group==="B")return classes.includes("B");
      if(group==="C")return classes.includes("B")||classes.includes("C");
      if(group==="CR")return classes.includes("B")||classes.includes("C")||classes.includes("CR");
      if(group==="A")return classes.includes("B")||classes.includes("A");
      return classes.includes("B")||classes.includes(group);
    });
  }
  function profileFor(classId,profiles){
    return {...fallback,...(profiles[classId]||{})};
  }
  function buildExam(questions,classId,profiles,random=Math.random){
    const profile=profileFor(classId,profiles);
    const pool=poolFor(questions,classId);
    const count=Math.min(profile.questions,pool.length);
    const doubles=shuffle(pool.filter(q=>q.doble===true),random).slice(0,profile.double);
    const selectedIds=new Set(doubles.map(q=>q.id));
    const rest=shuffle(pool.filter(q=>q.doble!==true),random).slice(0,count-doubles.length);
    return shuffle([...doubles,...rest].map(q=>({...q,doble:selectedIds.has(q.id)})),random);
  }
  function scoreExam(exam,answers,profile,timeExpired=false){
    let score=0;
    let correct=0;
    let wrong=0;
    let unanswered=0;
    for(const q of exam){
      const answer=answers[q.id];
      if(answer===undefined||answer===null){unanswered++;continue}
      if(answer===q.ok){
        correct++;
        score+=q.doble?2:1;
      }else wrong++;
    }
    const max=exam.reduce((total,q)=>total+(q.doble?2:1),0);
    const percent=max?Math.round(score/max*100):0;
    const pass=typeof profile.min==="number"?score>=profile.min:null;
    const studyPassed=pass===null?percent>=Math.round((profile.studyGoal||.8)*100):pass;
    return {score,max,correct,wrong,unanswered,percent,pass,studyPassed,timeExpired};
  }
  function finiteNumber(value,fallback=0){
    return typeof value==="number"&&Number.isFinite(value)&&value>=0?value:fallback;
  }
  function objectValue(value){
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }
  function normalizeState(input,validClasses){
    const source=objectValue(input);
    const classId=validClasses.includes(source.classId)?source.classId:"B";
    return {
      schemaVersion:2,
      classId,
      xp:Math.floor(finiteNumber(source.xp)),
      streak:Math.floor(finiteNumber(source.streak)),
      lastDay:typeof source.lastDay==="string"?source.lastDay:"",
      exams:Math.floor(finiteNumber(source.exams)),
      passed:Math.floor(finiteNumber(source.passed)),
      best:Math.floor(finiteNumber(source.best)),
      practice:Math.floor(finiteNumber(source.practice)),
      correct:Math.floor(finiteNumber(source.correct)),
      errorIds:Array.isArray(source.errorIds)?[...new Set(source.errorIds.filter(Number.isInteger))].slice(0,500):[],
      topicErrors:Object.fromEntries(Object.entries(objectValue(source.topicErrors)).filter(([key,value])=>typeof key==="string"&&Number.isFinite(value)).map(([key,value])=>[key,Math.max(0,Math.floor(value))])),
      signals:Object.fromEntries(Object.entries(objectValue(source.signals)).filter(([key,value])=>typeof key==="string"&&typeof value==="boolean")),
      checklist:Object.fromEntries(Object.entries(objectValue(source.checklist)).filter(([key,value])=>/^\d+$/.test(key)&&typeof value==="boolean"))
    };
  }
  function dateKey(date=new Date(),timeZone="America/Santiago"){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function previousDateKey(date=new Date(),timeZone="America/Santiago"){
    const previous=new Date(date);
    previous.setDate(previous.getDate()-1);
    return dateKey(previous,timeZone);
  }
  return {shuffle,groupFor,poolFor,profileFor,buildExam,scoreExam,normalizeState,dateKey,previousDateKey};
});
