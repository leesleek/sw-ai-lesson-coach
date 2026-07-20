import express from "express";
import OpenAI from "openai";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { buildPrompt } from "./prompt.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const cases = JSON.parse(fs.readFileSync(new URL("./data/cases.json", import.meta.url), "utf8"));


const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "9797";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const USE_LOCAL_PROGRESS_FALLBACK =
  String(process.env.USE_LOCAL_PROGRESS_FALLBACK || "false").toLowerCase() === "true";

const supabase =
  SUPABASE_URL && SUPABASE_SECRET_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
    : null;

const defaultProgressFile = path.join(process.cwd(), "storage", "teacher-progress.json");
const progressFile = process.env.PROGRESS_FILE || defaultProgressFile;

function readProgressRegistry() {
  if (!USE_LOCAL_PROGRESS_FALLBACK) return {};
  try {
    if (!fs.existsSync(progressFile)) return {};
    return JSON.parse(fs.readFileSync(progressFile, "utf8"));
  } catch (error) {
    console.error("[Progress registry read error]", error);
    return {};
  }
}

let progressRegistry = readProgressRegistry();

function persistProgressRegistry() {
  if (!USE_LOCAL_PROGRESS_FALLBACK) return;
  try {
    fs.mkdirSync(path.dirname(progressFile), { recursive: true });
    fs.writeFileSync(progressFile, JSON.stringify(progressRegistry, null, 2), "utf8");
  } catch (error) {
    console.error("[Progress registry write error]", error);
  }
}

function requireProgressStore(res) {
  if (supabase || USE_LOCAL_PROGRESS_FALLBACK) return true;
  res.status(503).json({
    error: {
      code: "PROGRESS_STORE_NOT_CONFIGURED",
      message: "Supabase 진행 상황 저장소가 설정되지 않았습니다.",
      guidance: "SUPABASE_URL과 SUPABASE_SECRET_KEY 환경변수를 등록해 주시기 바랍니다."
    }
  });
  return false;
}

function progressSummary(record) {
  const lastSeenAt = record.last_seen_at || record.lastSeenAt;
  const lastHeartbeatAt = record.last_heartbeat_at || record.lastHeartbeatAt || lastSeenAt;
  const loggedOutAt = record.logged_out_at || record.loggedOutAt || null;
  const lastSeen = new Date(lastSeenAt).getTime();
  const heartbeat = new Date(lastHeartbeatAt).getTime();
  const loggedOut = loggedOutAt ? new Date(loggedOutAt).getTime() : 0;
  const recent = Number.isFinite(lastSeen) && Date.now() - lastSeen <= 120000;
  const explicitlyLoggedOut = loggedOut > 0 && loggedOut >= heartbeat;

  return {
    clientId: record.client_id || record.clientId,
    teacherName: record.teacher_name || record.teacherName || "",
    lessonTitle: record.lesson_title || record.lessonTitle || "",
    subject: record.subject || "",
    grade: record.grade || "",
    lessonCount: record.lesson_count || record.lessonCount || "",
    designMode: record.design_mode || record.designMode || "",
    activeStep: Number(record.active_step ?? record.activeStep ?? 0),
    approvedCount: Number(record.approved_count ?? record.approvedCount ?? 0),
    totalCount: Number(record.total_count ?? record.totalCount ?? 44),
    progressPercent: Number(record.progress_percent ?? record.progressPercent ?? 0),
    completed: Boolean(record.completed),
    firstSeenAt: record.created_at || record.firstSeenAt || lastSeenAt,
    lastHeartbeatAt,
    lastSeenAt,
    loggedOutAt,
    online: recent && !explicitlyLoggedOut
  };
}

function verifyAdminPassword(password) {
  const supplied = Buffer.from(String(password || ""));
  const expected = Buffer.from(String(ADMIN_PASSWORD));
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(supplied, expected);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function apiErrorPayload(error, defaultCode = "OPENAI_ERROR") {
  const status = error?.status || error?.response?.status || 500;
  const message = error?.error?.message || error?.message || String(error);
  let code = error?.code || error?.error?.code || defaultCode;
  let guidance = "PowerShell의 서버 오류 기록을 확인해 주시기 바랍니다.";
  if (status === 401 || /api key|authentication|incorrect/i.test(message)) {
    code = "INVALID_API_KEY";
    guidance = ".env의 OPENAI_API_KEY를 확인하고 서버를 다시 시작해 주시기 바랍니다.";
  } else if (status === 429 || /quota|billing|rate limit/i.test(message)) {
    code = "QUOTA_OR_RATE_LIMIT";
    guidance = "OpenAI API 결제·사용 한도 또는 호출 제한을 확인해 주시기 바랍니다.";
  } else if (status === 404 || /model/i.test(message)) {
    code = "MODEL_NOT_AVAILABLE";
    guidance = ".env의 OPENAI_MODEL을 계정에서 사용 가능한 모델명으로 수정해 주시기 바랍니다.";
  } else if (/fetch|network|timeout|ENOTFOUND|ECONN/i.test(message)) {
    code = "NETWORK_ERROR";
    guidance = "인터넷 연결, 방화벽, 프록시와 api.openai.com 접속 가능 여부를 확인해 주시기 바랍니다.";
  }
  return { code, status, message, guidance };
}

function cloneCase(subject="과학", input={}) {
  const source = cases[subject] || cases["과학"];
  return {
    meta: {
      title: input.title || source.meta.title,
      subject,
      grade: input.grade || "5~6학년",
      lessonCount: input.lessonCount || source.meta.lessonCount,
      output: source.meta.output,
      standard: source.meta.standard,
      standardUrl: source.meta.url
    },
    steps: structuredClone(source.steps),
    fiveStage: structuredClone(source.fiveStage)
  };
}

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}


app.post("/api/progress", async (req, res) => {
  try {
    if (!requireProgressStore(res)) return;
    const {
      clientId,
      teacherName,
      lessonTitle = "",
      subject = "",
      grade = "",
      lessonCount = "",
      designMode = "",
      activeStep = 0,
      approvedCount = 0,
      totalCount = 44,
      progressPercent = 0,
      completed = false
    } = req.body || {};

    if (!clientId || !teacherName) {
      return res.status(400).json({
        error: {
          code: "INVALID_PROGRESS_PAYLOAD",
          message: "교사 이름과 접속 식별 정보가 필요합니다."
        }
      });
    }

    const now = new Date().toISOString();

    if (supabase) {
      const { error } = await supabase
        .from("teacher_progress")
        .upsert({
          client_id: String(clientId),
          teacher_name: String(teacherName),
          lesson_title: String(lessonTitle),
          subject: String(subject),
          grade: String(grade),
          lesson_count: String(lessonCount),
          design_mode: String(designMode),
          active_step: Number(activeStep) || 0,
          approved_count: Number(approvedCount) || 0,
          total_count: Number(totalCount) || 44,
          progress_percent: Number(progressPercent) || 0,
          completed: Boolean(completed),
          last_heartbeat_at: now,
          last_seen_at: now,
          logged_out_at: null,
          updated_at: now
        }, { onConflict: "client_id" });
      if (error) throw error;
    } else {
      const existing = progressRegistry[String(clientId)] || {
        clientId: String(clientId),
        firstSeenAt: now
      };
      progressRegistry[String(clientId)] = {
        ...existing,
        clientId: String(clientId),
        teacherName: String(teacherName),
        lessonTitle: String(lessonTitle),
        subject: String(subject),
        grade: String(grade),
        lessonCount: String(lessonCount),
        designMode: String(designMode),
        activeStep: Number(activeStep) || 0,
        approvedCount: Number(approvedCount) || 0,
        totalCount: Number(totalCount) || 44,
        progressPercent: Number(progressPercent) || 0,
        completed: Boolean(completed),
        lastHeartbeatAt: now,
        lastSeenAt: now,
        loggedOutAt: null
      };
      persistProgressRegistry();
    }

    res.json({ ok: true, store: supabase ? "supabase" : "local" });
  } catch (error) {
    console.error("[Progress save error]", error);
    res.status(500).json({
      error: {
        code: "PROGRESS_SAVE_FAILED",
        message: "교사 진행 상황을 저장하지 못했습니다.",
        guidance: error?.message || "Supabase 연결 정보와 테이블을 확인해 주시기 바랍니다."
      }
    });
  }
});

app.post("/api/progress/logout", async (req, res) => {
  try {
    if (!requireProgressStore(res)) return;
    const { clientId, teacherName = "" } = req.body || {};
    if (!clientId) {
      return res.status(400).json({
        error: {
          code: "INVALID_LOGOUT_PAYLOAD",
          message: "접속 식별 정보가 필요합니다."
        }
      });
    }
    const now = new Date().toISOString();

    if (supabase) {
      const { error } = await supabase
        .from("teacher_progress")
        .update({
          teacher_name: String(teacherName),
          logged_out_at: now,
          last_seen_at: now,
          updated_at: now
        })
        .eq("client_id", String(clientId));
      if (error) throw error;
    } else if (progressRegistry[String(clientId)]) {
      progressRegistry[String(clientId)] = {
        ...progressRegistry[String(clientId)],
        teacherName: String(teacherName),
        loggedOutAt: now,
        lastSeenAt: now
      };
      persistProgressRegistry();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[Logout save error]", error);
    res.status(500).json({
      error: {
        code: "LOGOUT_SAVE_FAILED",
        message: "접속 종료 상태를 저장하지 못했습니다."
      }
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (!verifyAdminPassword(req.body?.password)) {
    return res.status(401).json({
      error: {
        code: "INVALID_ADMIN_PASSWORD",
        message: "관리자 비밀번호가 올바르지 않습니다."
      }
    });
  }
  res.json({ ok: true });
});

app.post("/api/admin/progress", async (req, res) => {
  try {
    if (!verifyAdminPassword(req.body?.password)) {
      return res.status(401).json({
        error: {
          code: "INVALID_ADMIN_PASSWORD",
          message: "관리자 비밀번호가 올바르지 않습니다."
        }
      });
    }
    if (!requireProgressStore(res)) return;

    let teachers;
    if (supabase) {
      const { data, error } = await supabase
        .from("teacher_progress")
        .select("*")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      teachers = (data || []).map(progressSummary);
    } else {
      teachers = Object.values(progressRegistry)
        .map(progressSummary)
        .sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return new Date(b.lastSeenAt) - new Date(a.lastSeenAt);
        });
    }

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      teachers,
      store: supabase ? "supabase" : "local"
    });
  } catch (error) {
    console.error("[Admin progress error]", error);
    res.status(500).json({
      error: {
        code: "PROGRESS_LOAD_FAILED",
        message: "교사 진행 상황을 불러오지 못했습니다.",
        guidance: error?.message || "Supabase 연결 상태를 확인해 주시기 바랍니다."
      }
    });
  }
});

app.post("/api/admin/delete-progress", async (req, res) => {
  try {
    if (!verifyAdminPassword(req.body?.password)) {
      return res.status(401).json({
        error: {
          code: "INVALID_ADMIN_PASSWORD",
          message: "관리자 비밀번호가 올바르지 않습니다."
        }
      });
    }
    if (!requireProgressStore(res)) return;

    const clientIds = Array.isArray(req.body?.clientIds)
      ? [...new Set(req.body.clientIds.map(String).filter(Boolean))]
      : [];

    if (!clientIds.length) {
      return res.status(400).json({
        error: {
          code: "NO_PROGRESS_SELECTED",
          message: "삭제할 접속 종료 기록을 선택해 주시기 바랍니다."
        }
      });
    }

    let records;
    if (supabase) {
      const { data, error } = await supabase
        .from("teacher_progress")
        .select("*")
        .in("client_id", clientIds);
      if (error) throw error;
      records = (data || []).map(progressSummary);
    } else {
      records = clientIds
        .map(id => progressRegistry[id])
        .filter(Boolean)
        .map(progressSummary);
    }

    const deletable = records.filter(record => !record.online).map(record => record.clientId);
    const blocked = records
      .filter(record => record.online)
      .map(record => ({ clientId: record.clientId, teacherName: record.teacherName }));

    if (deletable.length) {
      if (supabase) {
        const { error } = await supabase
          .from("teacher_progress")
          .delete()
          .in("client_id", deletable);
        if (error) throw error;
      } else {
        deletable.forEach(id => delete progressRegistry[id]);
        persistProgressRegistry();
      }
    }

    res.json({
      ok: true,
      deletedCount: deletable.length,
      deleted: deletable,
      blocked
    });
  } catch (error) {
    console.error("[Delete progress error]", error);
    res.status(500).json({
      error: {
        code: "PROGRESS_DELETE_FAILED",
        message: "접속 기록을 삭제하지 못했습니다."
      }
    });
  }
});

app.post("/api/admin/clear-offline", async (req, res) => {
  try {
    if (!verifyAdminPassword(req.body?.password)) {
      return res.status(401).json({
        error: {
          code: "INVALID_ADMIN_PASSWORD",
          message: "관리자 비밀번호가 올바르지 않습니다."
        }
      });
    }
    if (!requireProgressStore(res)) return;

    const cutoffHours = Number(req.body?.cutoffHours) || 24;
    const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000).toISOString();
    let records;

    if (supabase) {
      const { data, error } = await supabase
        .from("teacher_progress")
        .select("*")
        .lt("last_seen_at", cutoff);
      if (error) throw error;
      records = (data || []).map(progressSummary);
    } else {
      records = Object.values(progressRegistry)
        .map(progressSummary)
        .filter(record => new Date(record.lastSeenAt) < new Date(cutoff));
    }

    const deletable = records.filter(record => !record.online).map(record => record.clientId);

    if (deletable.length) {
      if (supabase) {
        const { error } = await supabase
          .from("teacher_progress")
          .delete()
          .in("client_id", deletable);
        if (error) throw error;
      } else {
        deletable.forEach(id => delete progressRegistry[id]);
        persistProgressRegistry();
      }
    }

    res.json({ ok: true, deletedCount: deletable.length });
  } catch (error) {
    console.error("[Clear offline error]", error);
    res.status(500).json({
      error: {
        code: "OFFLINE_CLEAR_FAILED",
        message: "오래된 접속 기록을 삭제하지 못했습니다."
      }
    });
  }
});

app.post("/api/topic-example", async (req, res) => {
  const { subject = "", grade = "", lessonCount = "" } = req.body || {};

  if (!subject || !grade || !lessonCount) {
    return res.status(400).json({
      error: {
        code: "MISSING_TOPIC_CONTEXT",
        message: "교과, 학년, 차시를 모두 선택해 주시기 바랍니다."
      }
    });
  }

  const fallbackBySubject = {
    "국어": "우리 학교의 불편한 점을 조사하고 설득력 있는 개선 제안 만들기",
    "사회": "우리 지역의 생활 문제를 조사하고 디지털 지도로 해결 방안 제안하기",
    "도덕": "온라인에서 서로 존중하는 의사소통 약속 만들기",
    "수학": "학교생활 자료를 수집·분석하여 더 나은 생활 방법 제안하기",
    "과학": "학교 환경을 관찰하고 과학적 근거로 개선 방안 설계하기",
    "실과": "학교생활의 불편함을 해결하는 SW·AI 활용 작품 설계하기",
    "체육": "우리 반의 건강한 신체활동 참여를 높이는 방법 설계하기",
    "음악": "학교생활의 이야기를 담은 디지털 음악 콘텐츠 만들기",
    "미술": "학교의 문제를 알리고 행동을 이끄는 시각 자료 제작하기",
    "영어": "학교를 더 좋은 곳으로 만드는 아이디어를 영어로 소개하기"
  };

  const fallbackTitle = `${grade} ${subject} ${lessonCount} 수업: ${
    fallbackBySubject[subject] || "생활 속 문제를 발견하고 SW·AI로 해결 방안 만들기"
  }`;

  const client = getClient();
  if (!client) {
    return res.json({
      title: fallbackTitle,
      demo: true,
      apiError: {
        code: "MISSING_API_KEY",
        status: 0,
        message: "OPENAI_API_KEY가 설정되지 않아 교과·학년·차시 기반 기본 예시를 생성했습니다.",
        guidance: ".env에 API 키를 입력하면 AI가 새로운 수업 주제를 생성합니다."
      }
    });
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: `초등학교 ${grade} ${subject} ${lessonCount} 분량의 SW·AI 활용 수업 주제 1개를 생성하라.
조건:
- 초등학생의 문제해결력과 의사소통능력을 함께 기를 수 있어야 한다.
- 해당 교과의 학습 특성이 드러나야 한다.
- 학생 생활과 연결된 실제 문제 또는 도전 과제를 포함한다.
- 수업 주제에는 SW·AI 활용 여부나 특정 디지털 도구를 미리 포함하지 않는다.
- 문제해결에 SW·AI가 필요한지는 이후 수업 설계 단계에서 별도로 판단할 수 있도록 교과 학습과 문제 상황 중심으로 작성한다.
- 수업 주제 제목만 25~45자 정도의 자연스러운 한국어로 작성한다.
- 저장된 교과 사례나 기존 예시를 복사하지 말고 새롭게 생성한다.`,
      text: {
        format: {
          type: "json_schema",
          name: "topic_example",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title"],
            properties: {
              title: { type: "string" }
            }
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
    res.json({
      title: String(result.title || fallbackTitle).trim(),
      demo: false
    });
  } catch (error) {
    res.json({
      title: fallbackTitle,
      demo: true,
      apiError: apiErrorPayload(error)
    });
  }
});

app.get("/api/case/:subject", (req,res) => {
  const data=cases[req.params.subject];
  if (!data) return res.status(404).json({error:{code:"CASE_NOT_FOUND",message:"해당 교과 사례를 찾을 수 없다."}});
  res.json(data);
});


app.post("/api/coaching-start", (req,res) => {
  const input=req.body || {};
  const subject=cases[input.subject] ? input.subject : "과학";
  const base=cloneCase(subject,input);
  base.steps=base.steps.map(step=>({
    ...step,
    items:step.items.map(item=>({...item,content:""}))
  }));
  base.fiveStage=(base.fiveStage||[]).map(row=>({
    ...row,problemActivity:"",communicationActivity:"",focus:"",
    sentenceFrame:"",teacherQuestion:""
  }));
  res.json({design:base,demo:!process.env.OPENAI_API_KEY});
});

app.post("/api/coach-analysis", async (req,res) => {
  const {stepIndex=0,meta={},answers={},selectedOption="",reason=""}=req.body || {};
  const subject=cases[meta.subject] ? meta.subject : "과학";
  const fallbackAlternatives=[
    `${meta.title||"수업 주제"}를 학생 생활의 실제 문제와 연결한다.`,
    `학생이 자료를 수집하고 근거를 비교하여 해결 방향을 정하게 한다.`,
    `학생의 설명·협의·수정 과정이 드러나는 활동으로 구성한다.`
  ];
  const fallback={
    feedback:`현재 입력에는 수업의 핵심 방향이 포함되어 있습니다. 학생이 직접 판단할 부분과 SW·AI가 지원할 부분을 더 분명히 구분해 보시기 바랍니다.`,
    checkQuestion:"이 선택이 학생의 문제해결 행동과 의사소통 행동을 실제로 이끌 수 있는지 확인해 보시겠습니까?",
    alternatives:fallbackAlternatives
  };
  const client=getClient();
  if(!client)return res.json({...fallback,demo:true});
  try{
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input:`초등 SW·AI 수업 설계 코치로서 교사의 판단을 분석하라.
단계:${stepIndex+1}
수업:${JSON.stringify(meta)}
교사 답변:${JSON.stringify(answers)}
선택:${selectedOption}
이유:${reason}
교사의 생각을 대신 완성하지 말고, 강점 1개와 보완점 1개를 포함한 피드백, 점검 질문 1개, 서로 다른 설계 대안 3개를 한국어로 제시하라.`,
      text:{format:{type:"json_schema",name:"coach_analysis",strict:true,schema:{
        type:"object",additionalProperties:false,required:["feedback","checkQuestion","alternatives"],
        properties:{feedback:{type:"string"},checkQuestion:{type:"string"},alternatives:{type:"array",minItems:3,maxItems:3,items:{type:"string"}}}
      }}}
    });
    res.json({...JSON.parse(response.output_text),demo:false});
  }catch(error){
    res.json({...fallback,demo:true,apiError:apiErrorPayload(error)});
  }
});

app.post("/api/design-step", async (req,res) => {
  const {stepIndex=0,meta={},teacherThinking={},finalDecision=""}=req.body || {};
  const subject=cases[meta.subject] ? meta.subject : "과학";
  const caseStep=structuredClone(cases[subject].steps[stepIndex]);
  const fallbackItems=caseStep.items.map(item=>({
    label:item.label,
    content:`${finalDecision||teacherThinking.reason||meta.title}을 바탕으로 ${item.content}`
  }));
  const fallbackFive=stepIndex===1 ? structuredClone(cases[subject].fiveStage||[]) : null;
  const client=getClient();
  if(!client)return res.json({step:{...caseStep,items:fallbackItems},fiveStage:fallbackFive,demo:true});
  try{
    const schema={type:"object",additionalProperties:false,required:["step"],properties:{
      step:{type:"object",additionalProperties:false,required:["id","name","items"],properties:{
        id:{type:"integer"},name:{type:"string"},
        items:{type:"array",minItems:caseStep.items.length,maxItems:caseStep.items.length,items:{
          type:"object",additionalProperties:false,required:["label","content"],
          properties:{label:{type:"string"},content:{type:"string"}}
        }}
      }}
    }};
    if(stepIndex===1){
      schema.required.push("fiveStage");
      schema.properties.fiveStage={type:"array",minItems:5,maxItems:5,items:{
        type:"object",additionalProperties:false,
        required:["stage","problemActivity","communicationActivity","focus","sentenceFrame","teacherQuestion"],
        properties:{stage:{type:"string"},problemActivity:{type:"string"},communicationActivity:{type:"string"},focus:{type:"string"},sentenceFrame:{type:"string"},teacherQuestion:{type:"string"}}
      }};
    }
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input:`초등 SW·AI 수업 설계의 ${stepIndex+1}단계만 작성하라.
수업 정보:${JSON.stringify(meta)}
교사의 생각:${JSON.stringify(teacherThinking)}
교사의 최종 결정:${finalDecision}
참고 단계:${JSON.stringify(caseStep)}
항목명과 항목 수는 참고 단계와 정확히 같게 유지하라. 교사의 결정을 중심으로 학생 문제해결 행동과 의사소통 행동을 구체화하라. AI가 학생 사고를 대신하지 않게 하라.`,
      text:{format:{type:"json_schema",name:"lesson_step",strict:true,schema}}
    });
    res.json({...JSON.parse(response.output_text),demo:false});
  }catch(error){
    res.json({step:{...caseStep,items:fallbackItems},fiveStage:fallbackFive,demo:true,apiError:apiErrorPayload(error)});
  }
});

app.post("/api/design", async (req,res) => {
  const input=req.body || {};
  const subject=cases[input.subject] ? input.subject : "과학";
  const fallback=cloneCase(subject,input);
  const client=getClient();
  if (!client) {
    return res.json({
      design:fallback,demo:true,
      apiError:{code:"MISSING_API_KEY",status:0,message:"OPENAI_API_KEY가 설정되지 않았습니다.",guidance:".env 파일에 API 키를 입력한 뒤 서버를 다시 시작해 주시기 바랍니다."}
    });
  }
  try {
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input:buildPrompt(input,cases[subject]),
      text:{format:{type:"json_schema",name:"lesson_design",strict:true,schema:{
        type:"object",additionalProperties:false,required:["meta","steps"],properties:{
          meta:{type:"object",additionalProperties:false,required:["title","subject","grade","lessonCount","output","standard","standardUrl"],properties:{
            title:{type:"string"},subject:{type:"string"},grade:{type:"string"},lessonCount:{type:"string"},
            output:{type:"string"},standard:{type:"string"},standardUrl:{type:"string"}
          }},
          steps:{type:"array",minItems:7,maxItems:7,items:{type:"object",additionalProperties:false,required:["id","name","items"],properties:{
            id:{type:"integer"},name:{type:"string"},items:{type:"array",minItems:5,maxItems:7,items:{type:"object",additionalProperties:false,required:["label","content"],properties:{label:{type:"string"},content:{type:"string"}}}}
          }}}
        }
      }}}
    });
    const design=JSON.parse(response.output_text);
    design.fiveStage=fallback.fiveStage;
    res.json({design,demo:false});
  } catch(error) {
    const apiError=apiErrorPayload(error);
    console.error("[OpenAI design error]",apiError);
    res.json({design:fallback,demo:true,apiError});
  }
});


app.post("/api/process-rewrite", async (req,res) => {
  const {mode,rows=[],meta={}}=req.body || {};
  const subject=cases[meta?.subject] ? meta.subject : "과학";
  const caseRows=structuredClone(cases[subject].fiveStage || []);
  const sourceRows=Array.isArray(rows) && rows.length ? rows : caseRows;

  const simplifyRow=(row)=>({
    stage:row.stage || "",
    problemActivity:simplifyFallback(row.problemActivity || ""),
    communicationActivity:simplifyFallback(row.communicationActivity || row.focus || ""),
    focus:simplifyFallback(row.focus || row.communicationActivity || ""),
    sentenceFrame:simplifyFallback(row.sentenceFrame || ""),
    teacherQuestion:simplifyFallback(row.teacherQuestion || "")
  });

  const fallbackRows=mode==="simplify"
    ? sourceRows.map(simplifyRow)
    : caseRows.map(row=>({
        stage:row.stage || "",
        problemActivity:row.problemActivity || "",
        communicationActivity:row.communicationActivity || row.focus || "",
        focus:row.focus || row.communicationActivity || "",
        sentenceFrame:row.sentenceFrame || "",
        teacherQuestion:row.teacherQuestion || ""
      }));

  const client=getClient();
  if(!client){
    return res.json({
      rows:fallbackRows,
      demo:true,
      apiError:{
        code:"MISSING_API_KEY",
        status:0,
        message:"OPENAI_API_KEY가 설정되지 않아 교과 사례 기반 결과를 사용했습니다.",
        guidance:".env에 API 키를 입력하고 서버를 다시 시작해 주시기 바랍니다."
      }
    });
  }

  try{
    const instruction=mode==="simplify"
      ? `다음 초등 수업의 문제해결 5단계 표를 핵심 의미를 유지하면서 각 셀을 더 짧고 명확하게 다시 작성하라.
교과:${meta.subject} / 학년:${meta.grade} / 주제:${meta.title}
현재 표:${JSON.stringify(sourceRows, null, 2)}`
      : `다음 교과 사례를 참고하여 새 수업 주제에 맞는 문제해결 5단계 표를 다시 작성하라.
교과:${meta.subject} / 학년:${meta.grade} / 주제:${meta.title}
참고 사례:${JSON.stringify(caseRows, null, 2)}
각 단계는 단계명, 단계별 학생 활동, 중점 의사소통 요소, 학생 문장 틀, 단계별 교사 발문을 포함한다.`;

    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input:instruction,
      text:{format:{
        type:"json_schema",
        name:"five_stage_process",
        strict:true,
        schema:{
          type:"object",
          additionalProperties:false,
          required:["rows"],
          properties:{
            rows:{
              type:"array",
              minItems:5,
              maxItems:5,
              items:{
                type:"object",
                additionalProperties:false,
                required:["stage","problemActivity","communicationActivity","focus","sentenceFrame","teacherQuestion"],
                properties:{
                  stage:{type:"string"},
                  problemActivity:{type:"string"},
                  communicationActivity:{type:"string"},
                  focus:{type:"string"},
                  sentenceFrame:{type:"string"},
                  teacherQuestion:{type:"string"}
                }
              }
            }
          }
        }
      }}
    });

    const parsed=JSON.parse(response.output_text);
    res.json({rows:parsed.rows,demo:false});
  }catch(error){
    const apiError=apiErrorPayload(error);
    console.error("[OpenAI process rewrite error]",apiError);
    res.json({rows:fallbackRows,demo:true,apiError});
  }
});

app.post("/api/rewrite", async (req,res) => {
  const {mode,label,content,stepName,meta}=req.body || {};
  const subject=cases[meta?.subject] ? meta.subject : "과학";
  const caseItem=cases[subject].steps.flatMap(s=>s.items).find(i=>i.label===label);
  const fallback = mode==="simplify" ? simplifyFallback(content) : regenerateFallback(content,caseItem?.content,label,meta);
  const client=getClient();
  if (!client) return res.json({
    text:fallback,demo:true,
    apiError:{code:"MISSING_API_KEY",status:0,message:"OPENAI_API_KEY가 설정되지 않아 교과 사례 기반 문장을 사용했습니다.",guidance:".env에 API 키를 입력하고 서버를 다시 시작해 주시기 바랍니다."}
  });
  try {
    const instruction=mode==="simplify"
      ? `다음 초등 수업 설계 문장을 핵심 의미와 구체적 행동을 유지하면서 1~2문장, 원문의 약 55% 길이로 간결하게 다시 써라. 결과만 출력하라.\n${content}`
      : `아래 교과 사례와 현재 문장을 참고하되 복사하지 말고, 항목에 맞는 구체적인 수업 설계 문장 2문장으로 다시 작성하라.
교과:${meta?.subject} / 학년:${meta?.grade} / 주제:${meta?.title}
단계:${stepName} / 항목:${label}
교과 사례:${caseItem?.content || ""}
현재 문장:${content}`;
    const response=await client.responses.create({model:process.env.OPENAI_MODEL || "gpt-4.1-mini",input:instruction});
    res.json({text:response.output_text.trim(),demo:false});
  } catch(error) {
    const apiError=apiErrorPayload(error);
    console.error("[OpenAI rewrite error]",apiError);
    res.json({text:fallback,demo:true,apiError});
  }
});

function simplifyFallback(text="") {
  const cleanLine = (line) => {
    const trimmed=String(line||"").replace(/\s+/g," ").trim();
    if(!trimmed) return "";
    const colon=trimmed.indexOf(":");
    const prefix=colon>=0 ? trimmed.slice(0,colon+1)+" " : "";
    let body=colon>=0 ? trimmed.slice(colon+1).trim() : trimmed;
    body=body.replace(/할 수 있도록/g,"하도록").replace(/하도록 설계한다/g,"하게 한다").replace(/학생이 스스로/g,"학생이");
    const sentences=body.split(/(?<=[.!?])\s+/).filter(Boolean);
    body=sentences[0] || body;
    if(body.length>90) body=body.slice(0,88).replace(/\s+\S*$/,"…");
    return prefix+body;
  };
  return String(text||"").split(/\r?\n/).map(cleanLine).filter(Boolean).join("\n");
}
function regenerateFallback(current="",caseText="",label="",meta={}) {
  const fiveLabels=["단계별 학생 활동","단계별 중점 의사소통 요소","학생 문장 틀","단계별 교사 발문"];
  if(fiveLabels.includes(label) && caseText) return caseText;
  const base=caseText || current;
  return `${meta?.grade || "학생"}이 ${base.replace(/[.。]$/,"")} 활동을 수행한다. 모둠은 결과의 근거를 확인하고 ‘${label}’의 적절성을 협의하여 수정 내용을 기록한다.`;
}

app.listen(port,()=>console.log(`SW·AI 수업 설계 코치 v4.4: http://localhost:${port}`));
