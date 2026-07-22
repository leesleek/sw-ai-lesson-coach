const stepTitles=[
 "해결할 문제와 학습목표 설정하기",
 "5단계 문제해결 과정과 의사소통 설계하기",
 "SW·AI 활용 필요성과 시점 판단하기",
 "문제에 적합한 SW·AI 도구 선택하기",
 "학생 주도 AI 활용 과정 설계하기",
 "설명 활동과 과정 중심 평가 설계하기",
 "사용자 피드백과 해결안 개선하기"
];

function createClientId(){
  if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
const state={
  clientId:sessionStorage.getItem("swai-client-id")||(
    globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  ),
  adminPassword:"",
  adminTimer:null,
  adminSelected:new Set(),
  mode:"",
  progressSyncTimer:null,
  completionShown:false,
  worksheet:null,
  worksheetHtml:"",
  designMode:"quick",
  coaching:{answers:{},analysis:{},finalDecisions:{},generatedSteps:{},unlockedStep:0},
  design:null,activeStep:0,approved:{},demo:true,caseData:null,userName:""};
sessionStorage.setItem("swai-client-id",state.clientId);

const $=s=>document.querySelector(s);
const on=(s,e,h)=>{const el=$(s);if(el)el.addEventListener(e,h);return el;};
const cards=$("#cards"),nav=$("#step-nav");
const NCIC_URL="https://ncic.go.kr/";

function teacherName(){return state.userName?`${state.userName} 선생님`:"선생님";}
function msg(text){return `${teacherName()}. ${text}`;}
function showToast(text){const t=document.createElement("div");t.className="coach-toast";t.textContent=msg(text);document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add("show"));setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300)},2500)}
function showInfo(text,title="안내"){ $("#info-title").textContent=title; $("#info-message").textContent=msg(text); $("#info-dialog").showModal(); }
function showError(error){if(!error)return;$("#error-code").textContent=`${error.code||"ERROR"}${error.status?` · HTTP ${error.status}`:""}`;$("#error-message").textContent=msg(error.message||"알 수 없는 오류가 발생했습니다.");$("#error-guidance").textContent=error.guidance||"서버 설정을 확인해 주시기 바랍니다.";$("#error-dialog").showModal();}

async function fetchJson(url,options){
 try{const r=await fetch(url,options);const d=await r.json().catch(()=>({}));if(!r.ok)throw{code:d?.error?.code||"HTTP_ERROR",status:r.status,message:d?.error?.message||`서버 요청에 실패했습니다. (${r.status})`,guidance:d?.error?.guidance||"서버가 실행 중인지 확인하고 다시 시도해 주시기 바랍니다."};return d;}
 catch(e){if(e?.code)throw e;throw{code:"NETWORK_ERROR",status:0,message:e?.message||"서버에 연결할 수 없습니다.",guidance:"npm start 실행 여부와 http://localhost:3000 주소를 확인해 주시기 바랍니다."};}
}
async function loadCase(subject){state.caseData=await fetchJson(`/api/case/${encodeURIComponent(subject)}`);}
function save(){
 if(state.design)localStorage.setItem("swai-coach-v4.0",JSON.stringify({design:state.design,activeStep:state.activeStep,approved:state.approved,demo:state.demo,designMode:state.designMode,coaching:state.coaching,worksheet:state.worksheet,worksheetHtml:state.worksheetHtml}));
 scheduleTeacherProgressSync(250);
}
const COMPLETION_TARGET=44;
const totalItems=()=>state.design?COMPLETION_TARGET:0;
const approvedItems=()=>state.design?Math.min(
  COMPLETION_TARGET,
  Object.entries(state.approved).filter(([key,value])=>value && /^\d+-\d+$/.test(key)).length
):0;
const isDesignComplete=()=>Boolean(state.design)&&approvedItems()>=COMPLETION_TARGET;

function updateWorksheetButton(){
 const button=$("#worksheet-button");
 const wrap=$("#worksheet-button-wrap");
 if(!button||!wrap)return;
 const complete=isDesignComplete();
 const hasWorksheet=Boolean(state.worksheet);
 button.disabled=!complete;
 wrap.classList.toggle("enabled",complete);
 button.innerHTML=hasWorksheet
   ?'<span class="worksheet-button-icon">📄</span><span>학생 활동지 보기·수정</span>'
   :'<span class="worksheet-button-icon">📝</span><span>학생 활동지 생성</span>';
 wrap.dataset.tooltip=!complete
   ?"수업 설계 7단계를 완료하면 생성할 수 있습니다"
   :hasWorksheet
     ?"기존에 생성한 학생 활동지를 열어 수정하거나 저장할 수 있습니다"
     :"완료된 수업 설계를 바탕으로 학생 활동지를 생성합니다";
 const tooltip=wrap.querySelector(".worksheet-tooltip");
 if(tooltip)tooltip.textContent=wrap.dataset.tooltip;
}


function renderEmpty(){
 state.design=null;state.caseData=null;state.activeStep=0;state.approved={};state.worksheet=null;state.worksheetHtml="";
   state.completionShown=false;
 $("#brand-subtitle").textContent="수업 정보가 아직 없습니다";
 $("#user-label").textContent=`${teacherName()} 작업 중`;
 $("#subject-pill").textContent="교과";
 $("#lesson-title").textContent="새 수업을 만들어 주세요";
 $("#grade-label").textContent="-";$("#lesson-label").textContent="-";
 $("#progress-percent").textContent="0%";$("#progress-fill").style.width="0%";$("#approved-count").textContent="0";$("#total-count").textContent="0";
 nav.innerHTML="";
 $("#heading-number").textContent="00";$("#heading-kicker").textContent="수업 설계 준비";$("#heading-title").textContent="새 수업을 생성해 주세요";
 $("#coach-message").textContent=msg("교과, 학년, 차시와 수업 주제를 입력하여 새 수업을 만들어 볼까요?");
 $(".ai-notice p").textContent=msg("아직 AI 초안이 생성되지 않았습니다.");
 $("#standards-toggle").disabled=true;$("#standards-panel").hidden=true;
 cards.innerHTML=`<section class="empty-state"><div class="empty-icon">＋</div><h3>수업 설계 내용이 아직 없습니다</h3><p>${msg("오른쪽 위의 ‘새 수업’ 버튼을 눌러 수업 정보를 입력해 주시기 바랍니다.")}</p><button id="empty-new-button" class="primary">새 수업 만들기</button></section>`;
 on("#empty-new-button","click",openNewLesson);
 $("#overview-button").disabled=true;$("#check-button").disabled=true;updateWorksheetButton();
 scheduleTeacherProgressSync(100);
}

function renderMeta(){const m=state.design.meta;$("#lesson-title").textContent=m.title;$("#subject-pill").textContent=m.subject;$("#grade-label").textContent=m.grade;$("#lesson-label").textContent=m.lessonCount;$("#brand-subtitle").textContent=`${m.grade} · ${m.subject} · ${m.lessonCount}`;$("#user-label").textContent=`${teacherName()} 작업 중`;$("#standard-text").textContent=m.standard||state.caseData?.meta?.standard||"";$("#standard-url").href=NCIC_URL;$("#design-mode-badge").hidden=false;$("#design-mode-badge").textContent=state.designMode==="coaching"?"코칭 설계":"빠른 설계";}
function stepCoachText(i){return ["해결할 문제가 학생의 생활 경험과 연결되어 있는지 먼저 살펴보시기 바랍니다.","문제해결 5단계마다 학생 활동, 말하기 방식, 교사 발문이 서로 연결되는지 확인해 볼까요?","SW·AI를 꼭 써야 하는 순간과 쓰지 않아야 하는 순간이 구분되어 있는지 살펴보시기 바랍니다.","도구 이름보다 학생이 해결해야 할 문제와 도구 기능이 맞는지 확인해 볼까요?","AI가 학생의 생각을 대신하지 않고 질문·비교·검토를 돕도록 설계되어 있는지 살펴보시기 바랍니다.","산출물보다 문제해결 과정, 설명, 협의, 수정 과정을 평가할 수 있는지 확인해 볼까요?","피드백이 해결안을 개선하는 정보로 작동하는지 살펴보시기 바랍니다."][i];}

function checkDesignCompletion(){
 if(!state.design) return;
 const approved=approvedItems();
 if(approved<COMPLETION_TARGET){
   state.completionShown=false;
   save();
   return;
 }
 if(!state.completionShown){
   state.completionShown=true;
   save();
   $("#completion-message").textContent=msg("수업 설계가 완료되었습니다. 수고 많으셨습니다.");
   const dialog=$("#completion-dialog");
   if(dialog && !dialog.open) dialog.showModal();
 }
}
function updateProgress(){
 const t=totalItems(),a=approvedItems(),p=t?Math.min(100,Math.round(a/t*100)):0;
 $("#total-count").textContent=t;
 $("#approved-count").textContent=a;
 $("#progress-percent").textContent=p+"%";
 $("#progress-fill").style.width=p+"%";
 updateWorksheetButton();
 checkDesignCompletion();
}
function stepKeys(stepIndex){
 const step=state.design?.steps?.[stepIndex];
 return step?step.items.map((_,j)=>`${stepIndex}-${j}`):[];
}
function isStepApproved(stepIndex){
 const keys=stepKeys(stepIndex);
 return keys.length>0&&keys.every(key=>state.approved[key]);
}
function toggleStepApproval(stepIndex){
 const next=!isStepApproved(stepIndex);
 stepKeys(stepIndex).forEach(key=>state.approved[key]=next);
 state.completionShown=false;
 if(next&&state.designMode==="coaching")state.coaching.unlockedStep=Math.max(state.coaching.unlockedStep,stepIndex+1);
 save();
 render();
 showToast(next?`${stepIndex+1}단계의 모든 항목을 일괄 승인 완료했습니다.`:`${stepIndex+1}단계의 일괄 승인을 해제했습니다.`);
}
function renderStageApprovalButton(){
 const approved=isStepApproved(state.activeStep);
 return `<div class="stage-approval-bar"><div><strong>${state.activeStep+1}단계 일괄 검토</strong><span>${approved?"이 단계의 모든 항목이 승인되었습니다.":"이 단계의 모든 항목을 한 번에 승인할 수 있습니다."}</span></div><button id="approve-stage-button" class="approve ${approved?"approved-button":""}">${approved?"일괄 승인 완료":"일괄 검토 완료"}</button></div>`;
}
function bindStageApprovalButton(){
 const b=$("#approve-stage-button");if(b)b.onclick=()=>toggleStepApproval(state.activeStep);
}

const coachingQuestions=[
 [
  {id:"problem",label:"학생들이 해결해야 할 실제 문제는 무엇입니까?",type:"text",required:true},
  {id:"connection",label:"이 문제는 학생들의 생활과 어떻게 연결됩니까?",type:"text",required:true},
  {id:"goal",label:"수업 후 학생이 할 수 있어야 하는 것은 무엇입니까?",type:"text",required:true},
  {id:"evidence",label:"학생이 문제를 직접 확인하는 방법을 선택해 주세요.",type:"select",options:["직접 관찰","설문·인터뷰","자료 조사","교사 제공 자료"],required:true}
 ],
 [
  {id:"sequence",label:"학생들은 어떤 순서로 문제를 해결해야 합니까?",type:"text",required:true},
  {id:"conflict",label:"어느 단계에서 의견 차이가 발생할 수 있습니까?",type:"text",required:true},
  {id:"communication",label:"학생들이 반드시 설명하거나 협의해야 하는 내용은 무엇입니까?",type:"text",required:true}
 ],
 [
  {id:"need",label:"SW·AI를 사용하지 않으면 해결하기 어려운 부분은 무엇입니까?",type:"text",required:true},
  {id:"limit",label:"학생이 직접 생각해야 하므로 AI 사용을 제한할 부분은 무엇입니까?",type:"text",required:true},
  {id:"purpose",label:"SW·AI가 필요한 가장 중요한 이유를 선택해 주세요.",type:"select",options:["자료 수집·정리","해결안 비교","생각 시각화","프로그램·장치 구현","반복 작업 자동화"],required:true}
 ],
 [
  {id:"function",label:"필요한 도구 기능은 무엇입니까?",type:"select",options:["자료 수집","분석","시각화","콘텐츠 제작","프로그래밍·제어"],required:true},
  {id:"level",label:"학생들이 해당 도구를 사용할 수 있는 수준입니까?",type:"select",options:["스스로 사용 가능","간단한 안내 필요","교사 시범 필요","도구 변경 필요"],required:true},
  {id:"criteria",label:"도구를 선택할 때 가장 중요하게 볼 기준은 무엇입니까?",type:"text",required:true}
 ],
 [
  {id:"prompt",label:"학생이 AI에 어떤 질문을 해야 합니까?",type:"text",required:true},
  {id:"verify",label:"AI 결과가 적절한지 학생이 어떻게 확인해야 합니까?",type:"text",required:true},
  {id:"ownership",label:"AI 결과를 그대로 사용하지 않도록 어떤 활동을 넣겠습니까?",type:"text",required:true}
 ],
 [
  {id:"explain",label:"학생은 문제해결 과정을 어떻게 설명해야 합니까?",type:"text",required:true},
  {id:"processEvidence",label:"결과물 외에 어떤 과정 자료를 평가해야 합니까?",type:"text",required:true},
  {id:"criteria",label:"가장 중요하게 평가할 역량을 선택해 주세요.",type:"select",options:["문제 이해","근거 활용","협의와 조정","도구 활용","설명과 성찰"],required:true}
 ],
 [
  {id:"user",label:"누가 학생 결과물을 사용하거나 검토합니까?",type:"text",required:true},
  {id:"feedback",label:"어떤 방식으로 구체적인 피드백을 받습니까?",type:"text",required:true},
  {id:"revision",label:"학생이 피드백을 반영하여 무엇을 수정해야 합니까?",type:"text",required:true}
 ]
];

function coachingStepReady(stepIndex){
 return Boolean(state.coaching.generatedSteps[stepIndex]);
}
function previousStepComplete(stepIndex){
 if(stepIndex===0)return true;
 return isStepApproved(stepIndex-1);
}
function renderCoachingInput(){
 const i=state.activeStep,answers=state.coaching.answers[i]||{};
 const analysis=state.coaching.analysis[i];
 const finalDecision=state.coaching.finalDecisions[i]||"";
 const fields=coachingQuestions[i].map(q=>{
   const value=escapeHtml(answers[q.id]||"");
   if(q.type==="select")return `<label class="coach-field">${q.label}<select data-coach-id="${q.id}"><option value="">선택해 주세요</option>${q.options.map(o=>`<option ${answers[q.id]===o?"selected":""}>${o}</option>`).join("")}</select></label>`;
   return `<label class="coach-field">${q.label}<textarea data-coach-id="${q.id}" placeholder="선생님의 생각을 먼저 입력해 주세요.">${value}</textarea></label>`;
 }).join("");
 cards.innerHTML=`<section class="coaching-workbench">
   <div class="thinking-panel"><div class="panel-label">① 선생님의 생각</div>${fields}
     <label class="coach-field">선택하거나 입력한 이유를 한 문장으로 설명해 주세요.<textarea id="coach-reason">${escapeHtml(answers.reason||"")}</textarea></label>
     <button id="request-coaching" class="primary">AI 코칭 받기</button>
   </div>
   ${analysis?`<div class="ai-coaching-panel"><div class="panel-label">② AI 코칭</div><p>${escapeHtml(analysis.feedback)}</p><div class="check-question">${escapeHtml(analysis.checkQuestion)}</div>
     <div class="alternative-list">${analysis.alternatives.map((a,n)=>`<label><input type="radio" name="coach-alt" value="${n}" ${answers.selectedAlternative==n?"checked":""}><span><b>${String.fromCharCode(65+n)}안</b>${escapeHtml(a)}</span></label>`).join("")}</div>
     <label class="coach-field">③ 교사의 최종 결정<textarea id="final-decision" placeholder="대안을 선택·수정하거나 결합하여 최종 결정을 작성해 주세요.">${escapeHtml(finalDecision)}</textarea></label>
     <button id="generate-step-draft" class="primary" ${finalDecision.trim()?"":"disabled"}>이 단계 AI 초안 생성</button>
   </div>`:""}
 </section>`;
 cards.querySelectorAll("[data-coach-id]").forEach(el=>el.oninput=()=>{state.coaching.answers[i]={...(state.coaching.answers[i]||{}),[el.dataset.coachId]:el.value};save();});
 $("#coach-reason").oninput=e=>{state.coaching.answers[i]={...(state.coaching.answers[i]||{}),reason:e.target.value};save();};
 on("#request-coaching","click",requestCoaching);
 document.querySelectorAll('input[name="coach-alt"]').forEach(r=>r.onchange=()=>{const n=+r.value;state.coaching.answers[i].selectedAlternative=n;state.coaching.finalDecisions[i]=analysis.alternatives[n];renderCoachingInput();save();});
 const fd=$("#final-decision");
 if(fd)fd.oninput=e=>{state.coaching.finalDecisions[i]=e.target.value;$("#generate-step-draft").disabled=!e.target.value.trim();save();};
 on("#generate-step-draft","click",generateCoachingStep);
}
async function requestCoaching(){
 const i=state.activeStep,answers=state.coaching.answers[i]||{};
 const missing=coachingQuestions[i].filter(q=>q.required&&!String(answers[q.id]||"").trim());
 if(missing.length||!String(answers.reason||"").trim()){showInfo("모든 핵심 질문과 선택 이유를 먼저 입력해 주시기 바랍니다.","생각 입력 확인");return;}
 const b=$("#request-coaching");b.disabled=true;b.textContent="코칭 분석 중입니다…";
 try{
  const d=await fetchJson("/api/coach-analysis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stepIndex:i,meta:state.design.meta,answers,reason:answers.reason})});
  state.coaching.analysis[i]=d;renderCoachingInput();save();if(d.apiError)showError(d.apiError);
 }catch(e){showError(e)}finally{if(b){b.disabled=false;b.textContent="AI 코칭 받기";}}
}
async function generateCoachingStep(){
 const i=state.activeStep,decision=(state.coaching.finalDecisions[i]||"").trim();
 if(!decision){showInfo("교사의 최종 결정을 먼저 작성해 주시기 바랍니다.","최종 결정 확인");return;}
 const b=$("#generate-step-draft");b.disabled=true;b.textContent="단계 초안 생성 중입니다…";
 try{
  const d=await fetchJson("/api/design-step",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stepIndex:i,meta:state.design.meta,teacherThinking:state.coaching.answers[i],finalDecision:decision})});
  state.design.steps[i]=d.step;if(i===1&&d.fiveStage)state.design.fiveStage=d.fiveStage;
  state.coaching.generatedSteps[i]=true;state.coaching.unlockedStep=Math.max(state.coaching.unlockedStep,i);
  render();save();if(d.apiError)showError(d.apiError);
  showInfo(`${i+1}단계 초안이 생성되었습니다. 교사의 결정이 충실히 반영되었는지 검토해 주시기 바랍니다.`,"단계 초안 생성 완료");
 }catch(e){showError(e)}
}

function renderNav(){
 nav.innerHTML=state.design.steps.map((s,i)=>{
  const done=s.items.filter((_,j)=>state.approved[`${i}-${j}`]).length;
  const locked=state.designMode==="coaching" && i>0 && !previousStepComplete(i);
  return `<button class="nav-item ${i===state.activeStep?"active":""} ${locked?"locked":""}" data-step="${i}" ${locked?"disabled":""}><span class="nav-badge">${locked?"🔒":String(i+1).padStart(2,"0")}</span><span class="nav-text"><strong>${s.name}</strong><span>${locked?"이전 단계 승인 후 열림":`${done}/${s.items.length} 승인`}</span></span></button>`;
 }).join("");
 nav.querySelectorAll(".nav-item:not(.locked)").forEach(b=>b.onclick=()=>{state.activeStep=+b.dataset.step;render();save();scrollTo({top:0,behavior:"smooth"})});
}
async function rewrite(mode,item,button,textarea,step){button.disabled=true;const old=button.textContent;button.textContent=mode==="simplify"?"간단히 작성 중입니다…":"다시 생성 중입니다…";try{const d=await fetchJson("/api/rewrite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,label:item.label,content:textarea.value,stepName:step.name,meta:state.design.meta})});textarea.value=d.text;item.content=d.text;save();if(d.apiError)showError(d.apiError);showToast(mode==="simplify"?"선택한 문장을 더 간단하게 정리했습니다.":"선택한 항목을 다시 생성했습니다.")}catch(e){showError(e)}finally{button.disabled=false;button.textContent=old}}
function fiveStageRows(){return state.design.fiveStage||state.caseData?.fiveStage||[];}
function processApprovalKeys(){return ["1-0","1-1","1-2","1-3","1-4"];}
function isProcessApproved(){
 return processApprovalKeys().every(key=>state.approved[key]);
}
async function rewriteProcessTable(mode,button){
 const rows=fiveStageRows();
 const old=button.textContent;
 button.disabled=true;
 button.textContent=mode==="simplify"?"간단히 작성 중입니다…":"다시 생성 중입니다…";
 try{
   const d=await fetchJson("/api/process-rewrite",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
       mode,
       rows,
       meta:state.design.meta
     })
   });
   state.design.fiveStage=d.rows;
   processApprovalKeys().forEach(key=>state.approved[key]=false);
   save();
   render();
   if(d.apiError)showError(d.apiError);
   showToast(mode==="simplify"
     ?"5단계 문제해결 과정 표를 더 간단하게 정리했습니다."
     :"5단계 문제해결 과정 표를 다시 생성했습니다.");
 }catch(e){
   showError(e);
 }finally{
   button.disabled=false;
   button.textContent=old;
 }
}
function renderProcessTable(){
 const rows=fiveStageRows();
 const approved=isProcessApproved();
 cards.innerHTML=`<article class="process-card ${approved?"approved":""}">
 <div class="process-head"><div><h3>문제해결모형 5단계 기반 수업 흐름</h3><p>${msg("학생 활동, 의사소통 요소, 학생 문장 틀과 교사 발문이 서로 연결되는지 검토해 볼까요?")}</p></div><span class="ai-tag">AI 초안</span></div>
 <div class="process-table-wrap"><table class="process-table"><thead><tr><th>문제해결 5단계</th><th>단계별 학생 활동</th><th>중점 의사소통 요소</th><th>학생 문장 틀</th><th>단계별 교사 발문</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-row="${i}"><th>${r.stage||""}</th><td><textarea data-field="problemActivity">${r.problemActivity||""}</textarea></td><td><textarea data-field="focus">${r.focus||r.communicationActivity||""}</textarea></td><td><textarea data-field="sentenceFrame">${r.sentenceFrame||""}</textarea></td><td><textarea data-field="teacherQuestion">${r.teacherQuestion||""}</textarea></td></tr>`).join("")}</tbody></table></div>
 <div class="card-actions"><button id="process-regenerate">↻ 다시 생성</button><button id="process-simplify">≡ 더 간단히</button><button id="process-approve" class="approve ${approved?"approved-button":""}">${approved?"승인 완료":"검토 완료"}</button></div></article>${renderStageApprovalButton()}`;
 document.querySelectorAll(".process-table textarea").forEach(ta=>{ta.oninput=()=>{const i=+ta.closest("tr").dataset.row,field=ta.dataset.field;rows[i][field]=ta.value;if(field==="focus")rows[i].communicationActivity=ta.value;state.design.fiveStage=rows;processApprovalKeys().forEach(key=>state.approved[key]=false);state.completionShown=false;save();const b=$("#process-approve");if(b){b.textContent="검토 완료";b.classList.remove("approved-button");}}});
 $("#process-regenerate").onclick=e=>rewriteProcessTable("regenerate",e.currentTarget);
 $("#process-simplify").onclick=e=>rewriteProcessTable("simplify",e.currentTarget);
 $("#process-approve").onclick=()=>{const next=!isProcessApproved();processApprovalKeys().forEach(key=>state.approved[key]=next);state.completionShown=false;save();render();showToast(next?"5단계 문제해결 과정 표를 승인 완료했습니다.":"5단계 문제해결 과정 표의 승인을 해제했습니다.");};
 bindStageApprovalButton();
}
function renderCards(){
 const step=state.design.steps[state.activeStep];
 $("#heading-number").textContent=String(step.id).padStart(2,"0");
 $("#heading-kicker").textContent=`STEP ${step.id} · AI 초안 검토`;
 $("#heading-title").textContent=stepTitles[state.activeStep]||step.name;
 $("#coach-message").textContent=msg(stepCoachText(state.activeStep));
 if(state.designMode==="coaching"&&!coachingStepReady(state.activeStep)){renderCoachingInput();return;}
 if(state.activeStep===1){renderProcessTable();return;}
 cards.innerHTML=step.items.map((item,j)=>{const key=`${state.activeStep}-${j}`;return `<article class="card ${state.approved[key]?"approved":""}" data-index="${j}"><div class="card-head"><span class="item-no">${j+1}</span><strong>${item.label}</strong><span class="ai-tag">AI 초안</span></div><textarea></textarea><div class="card-actions"><button class="regen">↻ 다시 생성</button><button class="shorten">≡ 더 간단히</button><button class="approve ${state.approved[key]?"approved-button":""}">${state.approved[key]?"승인 완료":"검토 완료"}</button></div></article>`}).join("")+renderStageApprovalButton();
 cards.querySelectorAll(".card").forEach(card=>{const j=+card.dataset.index,key=`${state.activeStep}-${j}`,item=step.items[j],ta=card.querySelector("textarea");ta.value=item.content;ta.oninput=()=>{item.content=ta.value;state.approved[key]=false;state.completionShown=false;save();};card.querySelector(".regen").onclick=e=>rewrite("regenerate",item,e.currentTarget,ta,step);card.querySelector(".shorten").onclick=e=>rewrite("simplify",item,e.currentTarget,ta,step);card.querySelector(".approve").onclick=()=>{state.approved[key]=!state.approved[key];state.completionShown=false;save();render();showToast(state.approved[key]?`${item.label} 항목을 검토 완료했습니다.`:`${item.label} 항목의 검토 완료를 해제했습니다.`);};});
 bindStageApprovalButton();
}
function render(){if(!state.design){renderEmpty();return;}renderMeta();renderNav();renderCards();updateProgress();$("#standards-toggle").disabled=false;$("#overview-button").disabled=false;$("#check-button").disabled=false;$(".ai-notice p").textContent=state.designMode==="coaching"?msg("교사의 판단을 바탕으로 단계별 AI 초안을 생성합니다. 먼저 생각을 입력해 주시기 바랍니다."):state.demo?msg("업로드된 교과별 사례를 기반으로 초안을 표시했습니다. 검토하여 수정해 주시기 바랍니다."):msg("OpenAI가 교과 사례를 참고하여 생성한 초안입니다. 검토하여 수정해 주시기 바랍니다.");}

function resetSetupForm(){
 $("#subject-input").value="";$("#grade-input").value="";$("#lesson-input").value="";$("#title-input").value="";$("#constraints-input").value="";
 const coaching=document.querySelector('input[name="design-mode"][value="coaching"]');if(coaching)coaching.checked=true;
 document.querySelectorAll(".design-mode-card").forEach(x=>x.classList.toggle("selected",x.querySelector("input")?.checked));
}
function openNewLesson(){resetSetupForm();$("#setup-dialog").showModal();}
document.querySelectorAll('input[name="design-mode"]').forEach(r=>r.onchange=()=>document.querySelectorAll(".design-mode-card").forEach(x=>x.classList.toggle("selected",x.querySelector("input")?.checked)));

on("#teacher-mode-button","click",()=>{
 $("#access-mode-panel").hidden=true;
 $("#name-form").hidden=false;
 setTimeout(()=>$("#name-input")?.focus(),50);
});
on("#back-to-access-mode","click",()=>{
 $("#name-form").hidden=true;
 $("#access-mode-panel").hidden=false;
});
on("#admin-mode-button","click",()=>{
 $("#name-dialog")?.close();
 const input=$("#admin-password-input");
 const error=$("#admin-login-error");
 if(error){error.hidden=true;error.textContent="";}
 if(input)input.value="";
 $("#admin-login-dialog")?.showModal();
 setTimeout(()=>input?.focus(),50);
});

on("#name-form","submit",e=>{
 e.preventDefault();
 const name=$("#name-input").value.trim();
 if(!name)return;
 state.mode="teacher";
 state.userName=name.replace(/선생님$/,"").trim();
 localStorage.setItem("swai-user-name",state.userName);
 $("#name-dialog").close();
 document.body.classList.remove("name-mode");
 renderEmpty();
 scheduleTeacherProgressSync(0);
 showInfo("이제 새 수업을 만들어 수업 설계를 시작해 볼까요?","환영합니다");
});
on("#new-button","click",openNewLesson);on("#cancel-setup","click",()=>$("#setup-dialog").close());
on("#example-title-button","click",async()=>{
 const subject=$("#subject-input").value;
 const grade=$("#grade-input").value;
 const lessonCount=$("#lesson-input").value;
 if(!subject||!grade||!lessonCount){
   showInfo("교과, 학년, 차시를 먼저 선택해 주시기 바랍니다.","예시 주제 안내");
   return;
 }

 const button=$("#example-title-button");
 const oldText=button.textContent;
 button.disabled=true;
 button.textContent="생성 중…";

 try{
   const result=await fetchJson("/api/topic-example",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({subject,grade,lessonCount})
   });
   $("#title-input").value=result.title||"";
   $("#title-input").dispatchEvent(new Event("input",{bubbles:true}));
   if(result.apiError)showError(result.apiError);
   else showToast("교과, 학년, 차시에 맞는 새로운 수업 주제를 생성했습니다.");
 }catch(error){
   showError(error);
 }finally{
   button.disabled=false;
   button.textContent=oldText;
 }
});
on("#setup-form","submit",async e=>{
 e.preventDefault();
 const subject=$("#subject-input").value,grade=$("#grade-input").value,lessonCount=$("#lesson-input").value,title=$("#title-input").value.trim();
 if(!subject||!grade||!lessonCount||!title){showInfo("교과, 학년, 차시와 수업 주제를 모두 입력해 주시기 바랍니다.","입력 확인");return;}
 const designMode=document.querySelector('input[name="design-mode"]:checked')?.value||"coaching";
 const b=$("#create-lesson-button");b.disabled=true;b.textContent=designMode==="quick"?"전체 초안 생성 중입니다…":"코칭 설계 준비 중입니다…";
 try{
  const endpoint=designMode==="quick"?"/api/design":"/api/coaching-start";
  const d=await fetchJson(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject,grade,lessonCount,title,constraints:$("#constraints-input").value.trim(),userName:state.userName})});
  state.design=d.design;state.designMode=designMode;state.demo=!!d.demo;state.activeStep=0;state.approved={};state.worksheet=null;state.worksheetHtml="";
  state.coaching={answers:{},analysis:{},finalDecisions:{},generatedSteps:{},unlockedStep:0};
  await loadCase(subject);$("#setup-dialog").close();render();save();
  if(d.apiError)showError(d.apiError);
  showInfo(designMode==="quick"?"AI가 7단계 전체 초안을 만들었습니다. 검토하여 수정해 주시기 바랍니다.":"코칭 설계를 시작합니다. 1단계에서 선생님의 생각을 먼저 입력해 주시기 바랍니다.",designMode==="quick"?"빠른 설계 시작":"코칭 설계 시작");
 }catch(err){showError(err)}finally{b.disabled=false;b.textContent="수업 설계 시작";}
});
on("#standards-toggle","click",()=>{if(!state.design)return;const p=$("#standards-panel");p.hidden=!p.hidden;$("#standards-toggle").textContent=p.hidden?"▶ AI가 추천한 관련 성취기준 확인하기":"▼ 관련 성취기준 닫기"});
on("#standard-url","click",e=>{e.preventDefault();window.open(NCIC_URL,"_blank","noopener,noreferrer")});

function currentProgressPayload(){
 const hasDesign=Boolean(state.design);
 const approved=hasDesign?approvedItems():0;
 const total=hasDesign?44:44;
 const percent=hasDesign?Math.min(100,Math.round((approved/total)*100)):0;
 return {
   clientId:state.clientId,
   teacherName:state.userName||"",
   lessonTitle:state.design?.meta?.title||"",
   subject:state.design?.meta?.subject||"",
   grade:state.design?.meta?.grade||"",
   lessonCount:state.design?.meta?.lessonCount||"",
   designMode:state.designMode||"",
   activeStep:hasDesign?state.activeStep+1:0,
   approvedCount:approved,
   totalCount:total,
   progressPercent:percent,
   completed:approved>=44
 };
}

async function syncTeacherProgress(){
 if(!state.userName)return false;
 try{
   const response=await fetch("/api/progress",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify(currentProgressPayload()),
     keepalive:true
   });
   if(!response.ok){
     const data=await response.json().catch(()=>({}));
     throw new Error(data?.error?.message||`진행 상황 저장 실패 (${response.status})`);
   }
   return true;
 }catch(error){
   console.warn("진행 상황 동기화에 실패했습니다.",error);
   return false;
 }
}

function scheduleTeacherProgressSync(delay=0){
 if(!state.userName)return;
 clearTimeout(state.progressSyncTimer);
 state.progressSyncTimer=setTimeout(syncTeacherProgress,delay);
 if(!window.__teacherProgressTimer){
   window.__teacherProgressTimer=setInterval(syncTeacherProgress,15000);
 }
}

function formatLastSeen(iso){
 if(!iso)return "-";
 const date=new Date(iso);
 return new Intl.DateTimeFormat("ko-KR",{
   month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"
 }).format(date);
}

function updateAdminDeleteControls(teachers=[]){
 const offlineIds=teachers.filter(t=>!t.online).map(t=>String(t.clientId));
 const selectedOffline=offlineIds.filter(id=>state.adminSelected.has(id));
 const deleteButton=$("#delete-selected-admin");
 const selectAll=$("#select-all-offline");
 if(deleteButton){
   deleteButton.disabled=selectedOffline.length===0;
   deleteButton.textContent=selectedOffline.length
     ? `선택 삭제 (${selectedOffline.length})`
     : "선택 삭제";
 }
 if(selectAll){
   selectAll.disabled=offlineIds.length===0;
   selectAll.checked=offlineIds.length>0 && selectedOffline.length===offlineIds.length;
   selectAll.indeterminate=selectedOffline.length>0 && selectedOffline.length<offlineIds.length;
 }
}
function renderAdminDashboard(data){
 const teachers=data.teachers||[];
 state.adminSelected=new Set(
   [...state.adminSelected].filter(id=>teachers.some(t=>String(t.clientId)===id&&!t.online))
 );
 window.__adminTeachers=teachers;

 $("#admin-total-count").textContent=teachers.length;
 $("#admin-online-count").textContent=teachers.filter(t=>t.online).length;
 $("#admin-completed-count").textContent=teachers.filter(t=>t.completed).length;
 $("#admin-updated-at").textContent=`최근 갱신: ${formatLastSeen(data.generatedAt)}`;
 const body=$("#admin-progress-body");

 if(!teachers.length){
   body.innerHTML='<tr><td colspan="7">현재 저장된 접속 기록이 없습니다.</td></tr>';
   updateAdminDeleteControls(teachers);
   return;
 }

 body.innerHTML=teachers.map(t=>{
   const id=String(t.clientId||"");
   const selectable=!t.online;
   return `
   <tr class="${selectable?"offline-record":"online-record"}">
     <td class="admin-select-column">
       <input class="admin-record-select" type="checkbox"
         data-client-id="${escapeHtml(id)}"
         ${selectable?"":"disabled"}
         ${state.adminSelected.has(id)?"checked":""}
         aria-label="${escapeHtml(t.teacherName||"사용자")} 기록 선택" />
     </td>
     <td><span class="presence ${t.online?"online":"offline"}">${t.online?"접속 중":"접속 종료"}</span></td>
     <td><strong>${escapeHtml(t.teacherName)} 선생님</strong><span class="client-session">접속 ID: ${escapeHtml(id.slice(-8))}</span></td>
     <td>
       <strong>${escapeHtml(t.lessonTitle||"새 수업 미생성")}</strong>
       <span>${escapeHtml([t.subject,t.grade,t.lessonCount].filter(Boolean).join(" · ")||"-")}</span>
     </td>
     <td>${t.activeStep?`${t.activeStep}단계`:"시작 전"}</td>
     <td>
       <div class="admin-progress">
         <div><span style="width:${Math.max(0,Math.min(100,t.progressPercent||0))}%"></span></div>
         <strong>${t.approvedCount||0}/${t.totalCount||44} · ${t.progressPercent||0}%</strong>
       </div>
     </td>
     <td>${formatLastSeen(t.lastSeenAt)}</td>
   </tr>`;
 }).join("");

 body.querySelectorAll(".admin-record-select").forEach(box=>{
   box.onchange=()=>{
     const id=box.dataset.clientId;
     if(box.checked)state.adminSelected.add(id);
     else state.adminSelected.delete(id);
     updateAdminDeleteControls(teachers);
   };
 });

 updateAdminDeleteControls(teachers);
}
async function loadAdminProgress(){
 if(!state.adminPassword)return;
 try{
   const data=await fetchJson("/api/admin/progress",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({password:state.adminPassword})
   });
   renderAdminDashboard(data);
 }catch(error){
   showError(error);
 }
}

function startAdminRefresh(){
 clearInterval(state.adminTimer);
 state.adminTimer=setInterval(loadAdminProgress,10000);
}



function worksheetLines(count=3){
 return Array.from({length:count},()=>'<div class="student-writing-line"></div>').join("");
}

function worksheetSectionHtml(section,index){
 const prompts=section.prompts||[];
 if(section.type==="comparison"){
   return `<section class="student-sheet-section">
     <h3>${escapeHtml(section.title)}</h3>
     <p class="student-guide">${escapeHtml(section.guide)}</p>
     <table class="student-entry-table">
       <thead><tr>${prompts.map(p=>`<th>${escapeHtml(p)}</th>`).join("")}</tr></thead>
       <tbody><tr>${prompts.map(()=>'<td><br><br><br><br></td>').join("")}</tr><tr>${prompts.map(()=>'<td><br><br><br><br></td>').join("")}</tr></tbody>
     </table>
   </section>`;
 }
 if(section.type==="table"){
   return `<section class="student-sheet-section">
     <h3>${escapeHtml(section.title)}</h3>
     <p class="student-guide">${escapeHtml(section.guide)}</p>
     <table class="student-entry-table">
       <tbody>${prompts.map(p=>`<tr><th>${escapeHtml(p)}</th><td><br><br><br></td></tr>`).join("")}</tbody>
     </table>
   </section>`;
 }
 return `<section class="student-sheet-section">
   <h3>${escapeHtml(section.title)}</h3>
   <p class="student-guide">${escapeHtml(section.guide)}</p>
   ${prompts.map((p,i)=>`<div class="student-prompt"><strong>${i+1}. ${escapeHtml(p)}</strong>${worksheetLines(section.type==="reflection"?2:3)}</div>`).join("")}
 </section>`;
}

function buildWorksheetBody(worksheet){
 const m=state.design.meta;
 const info=(worksheet.studentInfoLabels||["이름","모둠","날짜"])
   .map(label=>`<div><strong>${escapeHtml(label)}</strong><span></span></div>`).join("");
 return `<article class="student-worksheet-document">
   <header class="student-sheet-header">
     <div class="student-sheet-subtitle">${escapeHtml(worksheet.subtitle||`${m.grade} ${m.subject} · ${m.lessonCount}`)}</div>
     <h1>${escapeHtml(worksheet.title||`${m.title} 학생 활동지`)}</h1>
     <div class="student-info-row">${info}</div>
   </header>
   <section class="student-goal">
     <strong>오늘의 배움</strong>
     <p>${escapeHtml(worksheet.learningGoal||"문제를 이해하고 친구와 협력하여 해결안을 만들어 봅시다.")}</p>
   </section>
   ${(worksheet.sections||[]).map(worksheetSectionHtml).join("")}
 </article>`;
}


function saveWorksheetEdits(){
 const content=$("#worksheet-content");
 if(!content||!state.worksheet)return;
 state.worksheetHtml=content.innerHTML;
 save();
}

function openSavedWorksheet(){
 if(!state.worksheet)return false;
 const content=$("#worksheet-content");
 content.innerHTML=state.worksheetHtml||buildWorksheetBody(state.worksheet);
 if(!state.worksheetHtml){
   state.worksheetHtml=content.innerHTML;
   save();
 }
 $("#worksheet-status").textContent="기존에 생성한 활동지입니다. 내용을 클릭하여 수정할 수 있습니다.";
 const dialog=$("#worksheet-dialog");
 if(dialog&&!dialog.open)dialog.showModal();
 return true;
}

async function generateStudentWorksheet(){
 if(!isDesignComplete()){
   showInfo("수업 설계 7단계를 모두 완료하면 학생 활동지를 생성할 수 있습니다.","활동지 생성 안내");
   return;
 }

 if(openSavedWorksheet())return;

 const button=$("#worksheet-button");
 button.disabled=true;
 const original=button.innerHTML;
 button.innerHTML='<span class="worksheet-button-icon">⏳</span><span>활동지 생성 중…</span>';

 try{
   const result=await fetchJson("/api/student-worksheet",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
       design:state.design,
       designMode:state.designMode
     })
   });
   state.worksheet=result.worksheet;
   $("#worksheet-content").innerHTML=buildWorksheetBody(state.worksheet);
   state.worksheetHtml=$("#worksheet-content").innerHTML;
   save();
   $("#worksheet-status").textContent="활동지 내용을 클릭하여 직접 수정할 수 있습니다.";
   const dialog=$("#worksheet-dialog");
   if(dialog&&!dialog.open)dialog.showModal();
   if(result.apiError)showError(result.apiError);
 }catch(error){
   showError(error);
 }finally{
   button.innerHTML=original;
   updateWorksheetButton();
 }
}

function currentWorksheetBody(){
 return $("#worksheet-content")?.innerHTML||state.worksheetHtml||"";
}
function currentWorksheetHtml(){
 const content=currentWorksheetBody();
 const title=state.worksheet?.title||`${state.design?.meta?.title||"수업"} 학생 활동지`;
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
 <style>
 body{font-family:"Malgun Gothic",Arial,sans-serif;color:#1f3347;line-height:1.55;margin:0;background:#fff}
 .student-worksheet-document{max-width:760px;margin:0 auto;padding:28px}
 .student-sheet-header{text-align:center;border-bottom:3px solid #183f68;padding-bottom:18px}
 .student-sheet-subtitle{font-size:10pt;color:#607487}.student-sheet-header h1{font-size:22pt;color:#173f69;margin:8px 0 18px}
 .student-info-row{display:flex;gap:18px;justify-content:flex-end}.student-info-row div{display:flex;align-items:flex-end;gap:7px;font-size:10pt}
 .student-info-row span{display:inline-block;width:90px;border-bottom:1px solid #455b6b;height:20px}
 .student-goal{margin:22px 0;background:#eef7f7;border-left:6px solid #118b8d;padding:14px 18px}
 .student-goal strong{color:#08787a}.student-goal p{margin:4px 0 0}
 .student-sheet-section{page-break-inside:avoid;margin:24px 0}.student-sheet-section h3{font-size:14pt;color:#173f69;border-bottom:2px solid #d6e2e8;padding-bottom:7px;margin-bottom:7px}
 .student-guide{font-size:9.5pt;color:#607487;margin:0 0 13px}
 .student-prompt{margin:14px 0}.student-prompt strong{font-size:10.5pt}
 .student-writing-line{height:27px;border-bottom:1px solid #aebbc5}
 .student-entry-table{border-collapse:collapse;width:100%;font-size:9.5pt}.student-entry-table th,.student-entry-table td{border:1px solid #94a7b5;padding:8px;vertical-align:top}
 .student-entry-table th{background:#edf5f8;color:#234e6d}
 @page{size:A4;margin:14mm}
 </style></head><body>${content}</body></html>`;
}

function saveWorksheetAsWord(){
 if(!state.worksheet)return;
 saveWorksheetEdits();
 const blob=buildDocxBlob(htmlFragmentToDocxBody(currentWorksheetBody()));
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;
 a.download=(state.worksheet.title||"학생_활동지").replace(/[\\/:*?"<>|]/g,"_")+".docx";
 document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 showToast("학생 활동지 Word 문서 저장을 시작했습니다.");
}

function saveWorksheetAsPdf(){
 if(!state.worksheet)return;
 saveWorksheetEdits();
 const win=window.open("","_blank");
 if(!win){
   showError({code:"POPUP_BLOCKED",message:"PDF 저장 창을 열 수 없습니다.",guidance:"브라우저의 팝업 차단을 해제해 주시기 바랍니다."});
   return;
 }
 win.document.write(currentWorksheetHtml());
 win.document.close();
 win.focus();
 setTimeout(()=>win.print(),400);
}


on("#close-completion","click",()=>{
 const dialog=$("#completion-dialog");
 if(dialog?.open)dialog.close();
 const worksheetButton=$("#worksheet-button");
 if(worksheetButton&&!worksheetButton.disabled){
   worksheetButton.focus({preventScroll:true});
   worksheetButton.scrollIntoView({behavior:"smooth",block:"center"});
 }
});

on("#worksheet-button","click",generateStudentWorksheet);
on("#close-worksheet","click",()=>{
 saveWorksheetEdits();
 $("#worksheet-dialog").close();
 updateWorksheetButton();
});
on("#save-worksheet-word","click",saveWorksheetAsWord);
on("#save-worksheet-pdf","click",saveWorksheetAsPdf);
on("#worksheet-content","input",()=>{
 clearTimeout(window.__worksheetSaveTimer);
 window.__worksheetSaveTimer=setTimeout(saveWorksheetEdits,500);
});
$("#worksheet-dialog")?.addEventListener("close",saveWorksheetEdits);

// ---- minimal .docx (OOXML) generator: builds a real Word file, not an HTML file renamed to .doc ----
const DOCX_CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function docxCrc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=DOCX_CRC_TABLE[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function docxU16(n){return [n&0xff,(n>>8)&0xff];}
function docxU32(n){return [n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>24)&0xff];}
function docxBuildZip(files){
 const chunks=[],centralRecords=[];let offset=0;
 for(const f of files){
   const nameBytes=Array.from(new TextEncoder().encode(f.name));
   const data=f.data;const crc=docxCrc32(data);
   const localHeader=Uint8Array.from([...docxU32(0x04034b50),...docxU16(20),...docxU16(0),...docxU16(0),...docxU16(0),...docxU16(0),...docxU32(crc),...docxU32(data.length),...docxU32(data.length),...docxU16(nameBytes.length),...docxU16(0),...nameBytes]);
   chunks.push(localHeader,data);
   centralRecords.push({nameBytes,crc,size:data.length,offset});
   offset+=localHeader.length+data.length;
 }
 const centralDirStart=offset;
 const centralChunks=centralRecords.map(r=>Uint8Array.from([...docxU32(0x02014b50),...docxU16(20),...docxU16(20),...docxU16(0),...docxU16(0),...docxU16(0),...docxU16(0),...docxU32(r.crc),...docxU32(r.size),...docxU32(r.size),...docxU16(r.nameBytes.length),...docxU16(0),...docxU16(0),...docxU16(0),...docxU16(0),...docxU32(0),...docxU32(r.offset),...r.nameBytes]));
 const centralDirBytes=centralChunks.reduce((a,c)=>a+c.length,0);
 const eocd=Uint8Array.from([...docxU32(0x06054b50),...docxU16(0),...docxU16(0),...docxU16(files.length),...docxU16(files.length),...docxU32(centralDirBytes),...docxU32(centralDirStart),...docxU16(0)]);
 const total=[...chunks,...centralChunks,eocd];
 const totalLen=total.reduce((a,c)=>a+c.length,0);
 const out=new Uint8Array(totalLen);let p=0;
 for(const c of total){out.set(c,p);p+=c.length;}
 return out;
}
function docxTextPart(name,xml){return {name,data:new TextEncoder().encode(xml)};}
function docxRun(text,opts={}){
 const props=[];
 if(opts.bold)props.push("<w:b/>");
 if(opts.size)props.push(`<w:sz w:val="${opts.size}"/>`);
 const rPr=props.length?`<w:rPr>${props.join("")}</w:rPr>`:"";
 return `<w:r>${rPr}<w:t xml:space="preserve">${escapeHtml(text)}</w:t></w:r>`;
}
function docxParagraph(runsOrText,opts={}){
 const runsXml=Array.isArray(runsOrText)?runsOrText.map(r=>docxRun(r.text,r)).join(""):(runsOrText?docxRun(runsOrText,opts):"");
 const spacing=opts.spacingAfter!=null?`<w:spacing w:after="${opts.spacingAfter}"/>`:"";
 const pPr=spacing?`<w:pPr>${spacing}</w:pPr>`:"";
 return `<w:p>${pPr}${runsXml}</w:p>`;
}
function docxHeading(text,level=1){
 const size=level===1?32:26;
 return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${docxRun(text,{bold:true,size})}</w:p>`;
}
function docxBlankLine(){
 return `<w:p><w:pPr><w:spacing w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`;
}
function docxTableCell(text){return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${text?docxRun(text):""}</w:p></w:tc>`;}
function docxTableRow(cells){return `<w:tr>${cells.map(docxTableCell).join("")}</w:tr>`;}
function docxTable(rows){
 return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>${rows.map(docxTableRow).join("")}</w:tbl>`;
}
function docxTableXml(tableEl){
 const rows=[...tableEl.querySelectorAll("tr")].map(tr=>[...tr.children].map(cell=>cell.textContent.trim()));
 return rows.length?docxTable(rows):"";
}
function docxHasDirectInlineContent(el){
 const blockTags=["p","div","section","article","header","table","dl","ul","ol","h1","h2","h3"];
 if([...el.children].some(c=>blockTags.includes(c.tagName.toLowerCase())))return false;
 const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
 const hasInlineTag=[...el.children].some(c=>["br","b","strong","span"].includes(c.tagName.toLowerCase()));
 return hasText||hasInlineTag;
}
function docxCollectLines(el){
 const lines=[[]];
 (function walk(node,bold){
   node.childNodes.forEach(child=>{
     if(child.nodeType===3){
       const t=child.textContent;
       if(t.trim())lines[lines.length-1].push({text:t,bold});
     }else if(child.nodeType===1){
       const tag=child.tagName.toLowerCase();
       if(tag==="br"){lines.push([]);return;}
       if(tag==="b"||tag==="strong"){walk(child,true);return;}
       walk(child,bold);
     }
   });
 })(el,false);
 return lines.filter(line=>line.length);
}
function docxLinesToParagraphs(lines){return lines.map(line=>docxParagraph(line)).join("");}
function docxBlockToXml(el){
 let out="";
 el.childNodes.forEach(child=>{
   if(child.nodeType===3){
     const t=child.textContent.trim();
     if(t)out+=docxParagraph(t);
     return;
   }
   if(child.nodeType!==1)return;
   const tag=child.tagName.toLowerCase();
   const cls=child.classList;

   if(tag==="table"){out+=docxTableXml(child);return;}
   if(tag==="h1"){out+=docxHeading(child.textContent.trim(),1);return;}
   if(tag==="h2"||tag==="h3"){out+=docxHeading(child.textContent.trim(),2);return;}
   if(tag==="br")return;

   if(cls.contains("student-writing-line")){out+=docxBlankLine();return;}
   if(cls.contains("student-prompt")){
     const label=child.querySelector("strong")?.textContent.trim()||child.textContent.trim();
     const blanks=child.querySelectorAll(".student-writing-line").length||2;
     out+=docxParagraph(label,{bold:true,spacingAfter:60});
     for(let i=0;i<blanks;i++)out+=docxBlankLine();
     return;
   }
   if(cls.contains("student-info-row")){
     const labels=[...child.querySelectorAll("strong")].map(s=>s.textContent.trim());
     out+=docxParagraph(labels.map(l=>`${l}: ______________`).join("    "));
     return;
   }

   if(tag==="dt"||tag==="strong"||tag==="b"){out+=docxParagraph(child.textContent.trim(),{bold:true});return;}
   if(tag==="dd"||tag==="p"){out+=docxParagraph(child.textContent.trim());return;}

   if(docxHasDirectInlineContent(child)){out+=docxLinesToParagraphs(docxCollectLines(child));return;}

   out+=docxBlockToXml(child);
 });
 return out;
}
function htmlFragmentToDocxBody(htmlString){
 const container=document.createElement("div");
 container.innerHTML=htmlString;
 return docxBlockToXml(container);
}
const DOCX_CONTENT_TYPES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
const DOCX_ROOT_RELS=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
function buildDocxBlob(bodyXml){
 const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`;
 const zipBytes=docxBuildZip([
   docxTextPart("[Content_Types].xml",DOCX_CONTENT_TYPES),
   docxTextPart("_rels/.rels",DOCX_ROOT_RELS),
   docxTextPart("word/document.xml",documentXml)
 ]);
 return new Blob([zipBytes],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}

function escapeHtml(text=""){return String(text).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function buildExportBody(){const m=state.design.meta;const sections=state.design.steps.map(step=>`<section><h2>${step.id}. ${escapeHtml(step.name)}</h2>${step.id===2&&state.design.fiveStage?`<table><thead><tr><th>문제해결 5단계</th><th>단계별 학생 활동</th><th>중점 의사소통 요소</th><th>학생 문장 틀</th><th>단계별 교사 발문</th></tr></thead><tbody>${state.design.fiveStage.map(r=>`<tr><td>${escapeHtml(r.stage)}</td><td>${escapeHtml(r.problemActivity)}</td><td>${escapeHtml(r.focus||r.communicationActivity)}</td><td>${escapeHtml(r.sentenceFrame)}</td><td>${escapeHtml(r.teacherQuestion)}</td></tr>`).join("")}</tbody></table>`:`<dl>${step.items.map(i=>`<dt>${escapeHtml(i.label)}</dt><dd>${escapeHtml(i.content)}</dd>`).join("")}</dl>`}</section>`).join("");return `<h1>문제해결력과 의사소통능력 강화를 위한 SW·AI 수업 설계안</h1><div class="meta"><b>교사:</b> ${escapeHtml(teacherName())}<br><b>교과:</b> ${escapeHtml(m.subject)} · <b>학년:</b> ${escapeHtml(m.grade)} · <b>차시:</b> ${escapeHtml(m.lessonCount)}<br><b>주제:</b> ${escapeHtml(m.title)}</div>${sections}`;}
function buildExportHtml(){const m=state.design.meta;return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(m.title)}</title><style>body{font-family:"Malgun Gothic",Arial,sans-serif;color:#1c3348;line-height:1.65;margin:38px}h1{color:#123f71;border-bottom:3px solid #123f71;padding-bottom:12px}h2{color:#0f6f78;margin-top:30px;border-left:6px solid #0f8f93;padding-left:10px}.meta{background:#f3f7f9;padding:14px 18px;border-radius:10px}dt{font-weight:700;margin-top:14px;color:#123f71}dd{margin:4px 0 0}table{border-collapse:collapse;width:100%;font-size:10pt}th,td{border:1px solid #adbcc7;padding:7px;vertical-align:top}th{background:#edf6fd}@page{size:A4;margin:15mm}</style></head><body>${buildExportBody()}</body></html>`;}
function saveAsPdf(){const win=window.open("","_blank");if(!win){showError({code:"POPUP_BLOCKED",message:"PDF 저장 창을 열 수 없습니다.",guidance:"브라우저의 팝업 차단을 해제해 주시기 바랍니다."});return;}win.document.write(buildExportHtml());win.document.close();win.focus();setTimeout(()=>win.print(),400);}
function saveAsWord(){const blob=buildDocxBlob(htmlFragmentToDocxBody(buildExportBody()));const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(state.design.meta.title||"SWAI_수업설계안").replace(/[\\/:*?"<>|]/g,"_")+".docx";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast("Word 문서 저장을 시작했습니다.");}

on("#overview-button","click",()=>{if(!state.design)return;$("#overview-content").innerHTML=state.design.steps.map(s=>`<section class="overview-step"><h3>${s.id}. ${s.name}</h3><ul>${s.items.map(i=>`<li><strong>${i.label}</strong>: ${i.content}</li>`).join("")}</ul></section>`).join("");$("#overview-dialog").showModal()});
on("#save-pdf","click",saveAsPdf);
on("#save-word","click",saveAsWord);
on("#check-button","click",()=>{if(!state.design)return;const t=totalItems(),a=approvedItems();$("#check-content").innerHTML=`<p>${msg(`${t}개 항목 중 ${a}개 항목을 검토했습니다. 남은 항목도 확인해 볼까요?`)}</p>`;$("#check-dialog").showModal()});
["error","info","case","overview","check"].forEach(id=>on(`#close-${id}`,"click",()=>$("#"+id+"-dialog").close()));


// 관리자 모드 이벤트

async function notifyLogout(){
 if(!state.clientId) return;
 try{
   await fetch("/api/progress/logout",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
       clientId:state.clientId,
       teacherName:state.userName||""
     }),
     keepalive:true
   });
 }catch(error){
   console.warn("로그아웃 상태 전송에 실패했습니다.",error);
 }
}

function clearAllLessonData(){
 clearInterval(window.__teacherProgressTimer);
 window.__teacherProgressTimer=null;
 clearInterval(state.adminTimer);
 state.adminTimer=null;

 [
   "swai-coach-v2.4",
   "swai-coach-v2.5",
   "swai-coach-v2.6",
   "swai-coach-v2.7",
   "swai-coach-v2.8",
   "swai-coach-v2.9",
   "swai-coach-v3.0",
   "swai-coach-v3.1",
   "swai-coach-v3.2",
   "swai-coach-v3.3",
   "swai-coach-v3.4",
   "swai-coach-v3.5",
   "swai-coach-v4.0",
   "swai-user-name",
   "swai-client-id"
 ].forEach(key=>localStorage.removeItem(key));

 sessionStorage.removeItem("swai-client-id");
 sessionStorage.removeItem("initial-api-error");

 state.design=null;
 state.caseData=null;
 state.activeStep=0;
 state.approved={};
 state.demo=true;
 state.completionShown=false;
 state.adminPassword="";
 state.mode="";
 state.userName="";
 state.clientId=createClientId();
 sessionStorage.setItem("swai-client-id",state.clientId);
}

async function leaveApp(){
 const name=state.mode==="admin"?"관리자":teacherName();
 if(state.mode!=="admin")await notifyLogout();
 clearAllLessonData();

 $("#goodbye-message").textContent=state.mode==="admin"?`${name}. 관리자 모드를 종료합니다.`:`${name}. 수고하셨습니다. 안녕히 가세요.`;
 const dialog=$("#goodbye-dialog");
 if(dialog && !dialog.open) dialog.showModal();
 renderEmpty();
}



on("#logout-button","click",leaveApp);
on("#close-goodbye","click",()=>{
 $("#goodbye-dialog").close();
 location.reload();
});

on("#close-admin-login","click",()=>$("#admin-login-dialog")?.close());

on("#admin-login-form","submit",async e=>{
 e.preventDefault();
 const password=$("#admin-password-input")?.value.trim()||"";
 const error=$("#admin-login-error");
 if(!password){
   if(error){error.textContent="관리자 비밀번호를 입력해 주시기 바랍니다.";error.hidden=false;}
   return;
 }
 try{
   await fetchJson("/api/admin/login",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({password})
   });
   state.mode="admin";
   state.adminPassword=password;
   state.userName="관리자";
   $("#admin-login-dialog")?.close();
   document.body.classList.remove("name-mode");
   document.body.classList.add("admin-mode");
   $("#admin-home").hidden=false;
   $("#user-chip").textContent="관리자";
   $("#user-label").textContent="관리자 모드";
   $("#brand-subtitle").textContent="접속 교사 진행 상황 관리";
   clearInterval(window.__teacherProgressTimer);
   window.__teacherProgressTimer=null;
 }catch(err){
   if(error){error.textContent=err.message||"관리자 비밀번호를 확인해 주시기 바랍니다.";error.hidden=false;}
 }
});

async function openAdminProgress(){
 if(!state.adminPassword)return;
 const dashboard=$("#admin-dashboard-dialog");
 if(dashboard && !dashboard.open)dashboard.showModal();
 await loadAdminProgress();
 startAdminRefresh();
}
on("#admin-progress-button","click",openAdminProgress);
on("#admin-home-progress-button","click",openAdminProgress);

on("#close-admin-dashboard","click",()=>{
 $("#admin-dashboard-dialog")?.close();
 clearInterval(state.adminTimer);
 state.adminTimer=null;
});
on("#refresh-admin","click",loadAdminProgress);

function selectedOfflineClientIds(){
 const teachers=window.__adminTeachers||[];
 return teachers
   .filter(t=>!t.online&&state.adminSelected.has(String(t.clientId)))
   .map(t=>String(t.clientId));
}

async function deleteSelectedAdminRecords(){
 const clientIds=selectedOfflineClientIds();
 if(!clientIds.length){
   showInfo("삭제할 접속 종료 사용자를 선택해 주시기 바랍니다.","선택 확인");
   return;
 }

 const names=(window.__adminTeachers||[])
   .filter(t=>clientIds.includes(String(t.clientId)))
   .map(t=>`${t.teacherName||"이름 없음"} 선생님`);

 const confirmed=window.confirm(
   `${names.join(", ")}의 접속 종료 기록 ${clientIds.length}개를 목록에서 삭제할까요?\n삭제한 기록은 복구할 수 없습니다.`
 );
 if(!confirmed)return;

 const button=$("#delete-selected-admin");
 button.disabled=true;
 button.textContent="삭제 중입니다…";

 try{
   const result=await fetchJson("/api/admin/delete-progress",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
       password:state.adminPassword,
       clientIds
     })
   });

   state.adminSelected.clear();

   if(result.blocked?.length){
     showInfo(
       `${result.deletedCount||0}개 기록을 삭제했습니다. 접속 중인 ${result.blocked.length}개 기록은 삭제하지 않았습니다.`,
       "삭제 결과"
     );
   }else{
     showToast(`${result.deletedCount||0}개의 접속 종료 기록을 삭제했습니다.`);
   }

   await loadAdminProgress();
 }catch(error){
   showError(error);
 }finally{
   button.disabled=false;
   updateAdminDeleteControls(window.__adminTeachers||[]);
 }
}

on("#select-all-offline","change",e=>{
 const teachers=window.__adminTeachers||[];
 const offlineIds=teachers.filter(t=>!t.online).map(t=>String(t.clientId));
 if(e.target.checked)offlineIds.forEach(id=>state.adminSelected.add(id));
 else offlineIds.forEach(id=>state.adminSelected.delete(id));

 document.querySelectorAll(".admin-record-select:not(:disabled)").forEach(box=>{
   box.checked=e.target.checked;
 });
 updateAdminDeleteControls(teachers);
});

on("#delete-selected-admin","click",deleteSelectedAdminRecords);

on("#clear-offline-admin","click",async()=>{
 try{
   const data=await fetchJson("/api/admin/clear-offline",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({password:state.adminPassword})
   });
   showToast(`${data.removed||0}개의 오래된 접속 기록을 정리했습니다.`);
   await loadAdminProgress();
 }catch(err){showError(err);}
});
window.addEventListener("beforeunload",()=>{if(state.mode==="teacher")syncTeacherProgress();});

// 앱을 열 때마다 기존 수업안을 불러오지 않고 이름 입력 화면부터 시작합니다.
document.body.classList.add("name-mode");renderEmpty();$("#access-mode-panel").hidden=false;$("#name-form").hidden=true;setTimeout(()=>$("#name-dialog").showModal(),30);
