import express from "express";
import OpenAI from "openai";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
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
        },
        realtime: {
          transport: ws
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
      message: "Supabase 吏꾪뻾 ?곹솴 ??μ냼媛 ?ㅼ젙?섏? ?딆븯?듬땲??",
      guidance: "SUPABASE_URL怨?SUPABASE_SECRET_KEY ?섍꼍蹂?섎? ?깅줉??二쇱떆湲?諛붾엻?덈떎."
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
  let guidance = "PowerShell???쒕쾭 ?ㅻ쪟 湲곕줉???뺤씤??二쇱떆湲?諛붾엻?덈떎.";
  if (status === 401 || /api key|authentication|incorrect/i.test(message)) {
    code = "INVALID_API_KEY";
    guidance = ".env??OPENAI_API_KEY瑜??뺤씤?섍퀬 ?쒕쾭瑜??ㅼ떆 ?쒖옉??二쇱떆湲?諛붾엻?덈떎.";
  } else if (status === 429 || /quota|billing|rate limit/i.test(message)) {
    code = "QUOTA_OR_RATE_LIMIT";
    guidance = "OpenAI API 寃곗젣쨌?ъ슜 ?쒕룄 ?먮뒗 ?몄텧 ?쒗븳???뺤씤??二쇱떆湲?諛붾엻?덈떎.";
  } else if (status === 404 || /model/i.test(message)) {
    code = "MODEL_NOT_AVAILABLE";
    guidance = ".env??OPENAI_MODEL??怨꾩젙?먯꽌 ?ъ슜 媛?ν븳 紐⑤뜽紐낆쑝濡??섏젙??二쇱떆湲?諛붾엻?덈떎.";
  } else if (/fetch|network|timeout|ENOTFOUND|ECONN/i.test(message)) {
    code = "NETWORK_ERROR";
    guidance = "?명꽣???곌껐, 諛⑺솕踰? ?꾨줉?쒖? api.openai.com ?묒냽 媛???щ?瑜??뺤씤??二쇱떆湲?諛붾엻?덈떎.";
  }
  return { code, status, message, guidance };
}

function cloneCase(subject="怨쇳븰", input={}) {
  const source = cases[subject] || cases["怨쇳븰"];
  return {
    meta: {
      title: input.title || source.meta.title,
      subject,
      grade: input.grade || "5~6?숇뀈",
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
          message: "援먯궗 ?대쫫怨??묒냽 ?앸퀎 ?뺣낫媛 ?꾩슂?⑸땲??"
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
        message: "援먯궗 吏꾪뻾 ?곹솴????ν븯吏 紐삵뻽?듬땲??",
        guidance: error?.message || "Supabase ?곌껐 ?뺣낫? ?뚯씠釉붿쓣 ?뺤씤??二쇱떆湲?諛붾엻?덈떎."
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
          message: "?묒냽 ?앸퀎 ?뺣낫媛 ?꾩슂?⑸땲??"
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
        message: "?묒냽 醫낅즺 ?곹깭瑜???ν븯吏 紐삵뻽?듬땲??"
      }
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (!verifyAdminPassword(req.body?.password)) {
    return res.status(401).json({
      error: {
        code: "INVALID_ADMIN_PASSWORD",
        message: "愿由ъ옄 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎."
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
          message: "愿由ъ옄 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎."
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
        message: "援먯궗 吏꾪뻾 ?곹솴??遺덈윭?ㅼ? 紐삵뻽?듬땲??",
        guidance: error?.message || "Supabase ?곌껐 ?곹깭瑜??뺤씤??二쇱떆湲?諛붾엻?덈떎."
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
          message: "愿由ъ옄 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎."
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
          message: "??젣???묒냽 醫낅즺 湲곕줉???좏깮??二쇱떆湲?諛붾엻?덈떎."
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
        message: "?묒냽 湲곕줉????젣?섏? 紐삵뻽?듬땲??"
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
          message: "愿由ъ옄 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎."
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
        message: "?ㅻ옒???묒냽 湲곕줉????젣?섏? 紐삵뻽?듬땲??"
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
        message: "援먭낵, ?숇뀈, 李⑥떆瑜?紐⑤몢 ?좏깮??二쇱떆湲?諛붾엻?덈떎."
      }
    });
  }

  const fallbackBySubject = {
    "援?뼱": "?곕━ ?숆탳??遺덊렪???먯쓣 議곗궗?섍퀬 ?ㅻ뱷???덈뒗 媛쒖꽑 ?쒖븞 留뚮뱾湲?,
    "?ы쉶": "?곕━ 吏??쓽 ?앺솢 臾몄젣瑜?議곗궗?섍퀬 ?붿???吏?꾨줈 ?닿껐 諛⑹븞 ?쒖븞?섍린",
    "?꾨뜒": "?⑤씪?몄뿉???쒕줈 議댁쨷?섎뒗 ?섏궗?뚰넻 ?쎌냽 留뚮뱾湲?,
    "?섑븰": "?숆탳?앺솢 ?먮즺瑜??섏쭛쨌遺꾩꽍?섏뿬 ???섏? ?앺솢 諛⑸쾿 ?쒖븞?섍린",
    "怨쇳븰": "?숆탳 ?섍꼍??愿李고븯怨?怨쇳븰??洹쇨굅濡?媛쒖꽑 諛⑹븞 ?ㅺ퀎?섍린",
    "?ㅺ낵": "?숆탳?앺솢??遺덊렪?⑥쓣 ?닿껐?섎뒗 SW쨌AI ?쒖슜 ?묓뭹 ?ㅺ퀎?섍린",
    "泥댁쑁": "?곕━ 諛섏쓽 嫄닿컯???좎껜?쒕룞 李몄뿬瑜??믪씠??諛⑸쾿 ?ㅺ퀎?섍린",
    "?뚯븙": "?숆탳?앺솢???댁빞湲곕? ?댁? ?붿????뚯븙 肄섑뀗痢?留뚮뱾湲?,
    "誘몄닠": "?숆탳??臾몄젣瑜??뚮━怨??됰룞???대걚???쒓컖 ?먮즺 ?쒖옉?섍린",
    "?곸뼱": "?숆탳瑜???醫뗭? 怨녹쑝濡?留뚮뱶???꾩씠?붿뼱瑜??곸뼱濡??뚭컻?섍린"
  };

  const fallbackTitle = `${grade} ${subject} ${lessonCount} ?섏뾽: ${
    fallbackBySubject[subject] || "?앺솢 ??臾몄젣瑜?諛쒓껄?섍퀬 SW쨌AI濡??닿껐 諛⑹븞 留뚮뱾湲?
  }`;

  const client = getClient();
  if (!client) {
    return res.json({
      title: fallbackTitle,
      demo: true,
      apiError: {
        code: "MISSING_API_KEY",
        status: 0,
        message: "OPENAI_API_KEY媛 ?ㅼ젙?섏? ?딆븘 援먭낵쨌?숇뀈쨌李⑥떆 湲곕컲 湲곕낯 ?덉떆瑜??앹꽦?덉뒿?덈떎.",
        guidance: ".env??API ?ㅻ? ?낅젰?섎㈃ AI媛 ?덈줈???섏뾽 二쇱젣瑜??앹꽦?⑸땲??"
      }
    });
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: `珥덈벑?숆탳 ${grade} ${subject} ${lessonCount} 遺꾨웾??SW쨌AI ?쒖슜 ?섏뾽 二쇱젣 1媛쒕? ?앹꽦?섎씪.
議곌굔:
- 珥덈벑?숈깮??臾몄젣?닿껐?κ낵 ?섏궗?뚰넻?λ젰???④퍡 湲곕? ???덉뼱???쒕떎.
- ?대떦 援먭낵???숈뒿 ?뱀꽦???쒕윭?섏빞 ?쒕떎.
- ?숈깮 ?앺솢怨??곌껐???ㅼ젣 臾몄젣 ?먮뒗 ?꾩쟾 怨쇱젣瑜??ы븿?쒕떎.
- ?섏뾽 二쇱젣?먮뒗 SW쨌AI ?쒖슜 ?щ????뱀젙 ?붿????꾧뎄瑜?誘몃━ ?ы븿?섏? ?딅뒗??
- 臾몄젣?닿껐??SW쨌AI媛 ?꾩슂?쒖????댄썑 ?섏뾽 ?ㅺ퀎 ?④퀎?먯꽌 蹂꾨룄濡??먮떒?????덈룄濡?援먭낵 ?숈뒿怨?臾몄젣 ?곹솴 以묒떖?쇰줈 ?묒꽦?쒕떎.
- ?섏뾽 二쇱젣 ?쒕ぉ留?25~45???뺣룄???먯뿰?ㅻ윭???쒓뎅?대줈 ?묒꽦?쒕떎.
- ??λ맂 援먭낵 ?щ???湲곗〈 ?덉떆瑜?蹂듭궗?섏? 留먭퀬 ?덈∼寃??앹꽦?쒕떎.`,
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
  if (!data) return res.status(404).json({error:{code:"CASE_NOT_FOUND",message:"?대떦 援먭낵 ?щ?瑜?李얠쓣 ???녿떎."}});
  res.json(data);
});


app.post("/api/coaching-start", (req,res) => {
  const input=req.body || {};
  const subject=cases[input.subject] ? input.subject : "怨쇳븰";
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
  const subject=cases[meta.subject] ? meta.subject : "怨쇳븰";
  const fallbackAlternatives=[
    `${meta.title||"?섏뾽 二쇱젣"}瑜??숈깮 ?앺솢???ㅼ젣 臾몄젣? ?곌껐?쒕떎.`,
    `?숈깮???먮즺瑜??섏쭛?섍퀬 洹쇨굅瑜?鍮꾧탳?섏뿬 ?닿껐 諛⑺뼢???뺥븯寃??쒕떎.`,
    `?숈깮???ㅻ챸쨌?묒쓽쨌?섏젙 怨쇱젙???쒕윭?섎뒗 ?쒕룞?쇰줈 援ъ꽦?쒕떎.`
  ];
  const fallback={
    feedback:`?꾩옱 ?낅젰?먮뒗 ?섏뾽???듭떖 諛⑺뼢???ы븿?섏뼱 ?덉뒿?덈떎. ?숈깮??吏곸젒 ?먮떒??遺遺꾧낵 SW쨌AI媛 吏?먰븷 遺遺꾩쓣 ??遺꾨챸??援щ텇??蹂댁떆湲?諛붾엻?덈떎.`,
    checkQuestion:"???좏깮???숈깮??臾몄젣?닿껐 ?됰룞怨??섏궗?뚰넻 ?됰룞???ㅼ젣濡??대걣 ???덈뒗吏 ?뺤씤??蹂댁떆寃좎뒿?덇퉴?",
    alternatives:fallbackAlternatives
  };
  const client=getClient();
  if(!client)return res.json({...fallback,demo:true});
  try{
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input:`珥덈벑 SW쨌AI ?섏뾽 ?ㅺ퀎 肄붿튂濡쒖꽌 援먯궗???먮떒??遺꾩꽍?섎씪.
?④퀎:${stepIndex+1}
?섏뾽:${JSON.stringify(meta)}
援먯궗 ?듬?:${JSON.stringify(answers)}
?좏깮:${selectedOption}
?댁쑀:${reason}
援먯궗???앷컖??????꾩꽦?섏? 留먭퀬, 媛뺤젏 1媛쒖? 蹂댁셿??1媛쒕? ?ы븿???쇰뱶諛? ?먭? 吏덈Ц 1媛? ?쒕줈 ?ㅻⅨ ?ㅺ퀎 ???3媛쒕? ?쒓뎅?대줈 ?쒖떆?섎씪.`,
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
  const subject=cases[meta.subject] ? meta.subject : "怨쇳븰";
  const caseStep=structuredClone(cases[subject].steps[stepIndex]);
  const fallbackItems=caseStep.items.map(item=>({
    label:item.label,
    content:`${finalDecision||teacherThinking.reason||meta.title}??諛뷀깢?쇰줈 ${item.content}`
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
      input:`珥덈벑 SW쨌AI ?섏뾽 ?ㅺ퀎??${stepIndex+1}?④퀎留??묒꽦?섎씪.
?섏뾽 ?뺣낫:${JSON.stringify(meta)}
援먯궗???앷컖:${JSON.stringify(teacherThinking)}
援먯궗??理쒖쥌 寃곗젙:${finalDecision}
李멸퀬 ?④퀎:${JSON.stringify(caseStep)}
??ぉ紐낃낵 ??ぉ ?섎뒗 李멸퀬 ?④퀎? ?뺥솗??媛숆쾶 ?좎??섎씪. 援먯궗??寃곗젙??以묒떖?쇰줈 ?숈깮 臾몄젣?닿껐 ?됰룞怨??섏궗?뚰넻 ?됰룞??援ъ껜?뷀븯?? AI媛 ?숈깮 ?ш퀬瑜???좏븯吏 ?딄쾶 ?섎씪.`,
      text:{format:{type:"json_schema",name:"lesson_step",strict:true,schema}}
    });
    res.json({...JSON.parse(response.output_text),demo:false});
  }catch(error){
    res.json({step:{...caseStep,items:fallbackItems},fiveStage:fallbackFive,demo:true,apiError:apiErrorPayload(error)});
  }
});

app.post("/api/design", async (req,res) => {
  const input=req.body || {};
  const subject=cases[input.subject] ? input.subject : "怨쇳븰";
  const fallback=cloneCase(subject,input);
  const client=getClient();
  if (!client) {
    return res.json({
      design:fallback,demo:true,
      apiError:{code:"MISSING_API_KEY",status:0,message:"OPENAI_API_KEY媛 ?ㅼ젙?섏? ?딆븯?듬땲??",guidance:".env ?뚯씪??API ?ㅻ? ?낅젰?????쒕쾭瑜??ㅼ떆 ?쒖옉??二쇱떆湲?諛붾엻?덈떎."}
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
  const subject=cases[meta?.subject] ? meta.subject : "怨쇳븰";
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
        message:"OPENAI_API_KEY媛 ?ㅼ젙?섏? ?딆븘 援먭낵 ?щ? 湲곕컲 寃곌낵瑜??ъ슜?덉뒿?덈떎.",
        guidance:".env??API ?ㅻ? ?낅젰?섍퀬 ?쒕쾭瑜??ㅼ떆 ?쒖옉??二쇱떆湲?諛붾엻?덈떎."
      }
    });
  }

  try{
    const instruction=mode==="simplify"
      ? `?ㅼ쓬 珥덈벑 ?섏뾽??臾몄젣?닿껐 5?④퀎 ?쒕? ?듭떖 ?섎?瑜??좎??섎㈃??媛??????吏㏐퀬 紐낇솗?섍쾶 ?ㅼ떆 ?묒꽦?섎씪.
援먭낵:${meta.subject} / ?숇뀈:${meta.grade} / 二쇱젣:${meta.title}
?꾩옱 ??${JSON.stringify(sourceRows, null, 2)}`
      : `?ㅼ쓬 援먭낵 ?щ?瑜?李멸퀬?섏뿬 ???섏뾽 二쇱젣??留욌뒗 臾몄젣?닿껐 5?④퀎 ?쒕? ?ㅼ떆 ?묒꽦?섎씪.
援먭낵:${meta.subject} / ?숇뀈:${meta.grade} / 二쇱젣:${meta.title}
李멸퀬 ?щ?:${JSON.stringify(caseRows, null, 2)}
媛??④퀎???④퀎紐? ?④퀎蹂??숈깮 ?쒕룞, 以묒젏 ?섏궗?뚰넻 ?붿냼, ?숈깮 臾몄옣 ?, ?④퀎蹂?援먯궗 諛쒕Ц???ы븿?쒕떎.`;

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
  const subject=cases[meta?.subject] ? meta.subject : "怨쇳븰";
  const caseItem=cases[subject].steps.flatMap(s=>s.items).find(i=>i.label===label);
  const fallback = mode==="simplify" ? simplifyFallback(content) : regenerateFallback(content,caseItem?.content,label,meta);
  const client=getClient();
  if (!client) return res.json({
    text:fallback,demo:true,
    apiError:{code:"MISSING_API_KEY",status:0,message:"OPENAI_API_KEY媛 ?ㅼ젙?섏? ?딆븘 援먭낵 ?щ? 湲곕컲 臾몄옣???ъ슜?덉뒿?덈떎.",guidance:".env??API ?ㅻ? ?낅젰?섍퀬 ?쒕쾭瑜??ㅼ떆 ?쒖옉??二쇱떆湲?諛붾엻?덈떎."}
  });
  try {
    const instruction=mode==="simplify"
      ? `?ㅼ쓬 珥덈벑 ?섏뾽 ?ㅺ퀎 臾몄옣???듭떖 ?섎?? 援ъ껜???됰룞???좎??섎㈃??1~2臾몄옣, ?먮Ц????55% 湲몄씠濡?媛꾧껐?섍쾶 ?ㅼ떆 ?⑤씪. 寃곌낵留?異쒕젰?섎씪.\n${content}`
      : `?꾨옒 援먭낵 ?щ?? ?꾩옱 臾몄옣??李멸퀬?섎릺 蹂듭궗?섏? 留먭퀬, ??ぉ??留욌뒗 援ъ껜?곸씤 ?섏뾽 ?ㅺ퀎 臾몄옣 2臾몄옣?쇰줈 ?ㅼ떆 ?묒꽦?섎씪.
援먭낵:${meta?.subject} / ?숇뀈:${meta?.grade} / 二쇱젣:${meta?.title}
?④퀎:${stepName} / ??ぉ:${label}
援먭낵 ?щ?:${caseItem?.content || ""}
?꾩옱 臾몄옣:${content}`;
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
    body=body.replace(/?????덈룄濡?g,"?섎룄濡?).replace(/?섎룄濡??ㅺ퀎?쒕떎/g,"?섍쾶 ?쒕떎").replace(/?숈깮???ㅼ뒪濡?g,"?숈깮??);
    const sentences=body.split(/(?<=[.!?])\s+/).filter(Boolean);
    body=sentences[0] || body;
    if(body.length>90) body=body.slice(0,88).replace(/\s+\S*$/,"??);
    return prefix+body;
  };
  return String(text||"").split(/\r?\n/).map(cleanLine).filter(Boolean).join("\n");
}
function regenerateFallback(current="",caseText="",label="",meta={}) {
  const fiveLabels=["?④퀎蹂??숈깮 ?쒕룞","?④퀎蹂?以묒젏 ?섏궗?뚰넻 ?붿냼","?숈깮 臾몄옣 ?","?④퀎蹂?援먯궗 諛쒕Ц"];
  if(fiveLabels.includes(label) && caseText) return caseText;
  const base=caseText || current;
  return `${meta?.grade || "?숈깮"}??${base.replace(/[.??$/,"")} ?쒕룞???섑뻾?쒕떎. 紐⑤몺? 寃곌낵??洹쇨굅瑜??뺤씤?섍퀬 ??{label}?숈쓽 ?곸젅?깆쓣 ?묒쓽?섏뿬 ?섏젙 ?댁슜??湲곕줉?쒕떎.`;
}

app.listen(port,()=>console.log(`SW쨌AI ?섏뾽 ?ㅺ퀎 肄붿튂 v4.4: http://localhost:${port}`));
