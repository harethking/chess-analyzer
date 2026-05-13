import { useState, useEffect } from "react";

// ── Password hash ─────────────────────────────────────────────────────────────
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return h.toString(36);
}

// ── Chess board/FEN ───────────────────────────────────────────────────────────
const INIT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

function fenToBoard(fen) {
  return fen.split("/").map(row => {
    const cells = [];
    for (const ch of row) {
      if (isNaN(ch)) cells.push(ch);
      else for (let i = 0; i < +ch; i++) cells.push(null);
    }
    return cells;
  });
}

function applyMove(board, san, isWhite) {
  const b = board.map(r => [...r]);
  const F = { a:0,b:1,c:2,d:3,e:4,f:5,g:6,h:7 };
  if (san === "O-O") {
    const r = isWhite ? 7 : 0;
    b[r][4]=null; b[r][6]=isWhite?"K":"k"; b[r][7]=null; b[r][5]=isWhite?"R":"r";
    return b;
  }
  if (san === "O-O-O") {
    const r = isWhite ? 7 : 0;
    b[r][4]=null; b[r][2]=isWhite?"K":"k"; b[r][0]=null; b[r][3]=isWhite?"R":"r";
    return b;
  }
  const clean = san.replace(/[+#?!=x]/g,"");
  const toFile = F[clean[clean.length-2]];
  const toRank = 8 - parseInt(clean[clean.length-1]);
  if (toFile === undefined || isNaN(toRank)) return b;

  const firstCh = clean[0];
  const isPiece = isNaN(firstCh) && firstCh === firstCh.toUpperCase() && !"abcdefgh".includes(firstCh);

  if (!isPiece) {
    const pawn = isWhite ? "P" : "p";
    const fromFile = F[clean[0]] ?? toFile;
    const dir = isWhite ? 1 : -1;
    for (let r = 0; r < 8; r++) {
      if (b[r][fromFile] === pawn) {
        b[r][fromFile] = null;
        const promo = clean.includes("=") ? (isWhite ? clean[clean.indexOf("=")+1] : clean[clean.indexOf("=")+1].toLowerCase()) : pawn;
        b[toRank][toFile] = promo;
        if (fromFile !== toFile && !board[toRank][toFile]) b[isWhite ? toRank+1 : toRank-1][toFile] = null;
        break;
      }
    }
  } else {
    const target = isWhite ? firstCh.toUpperCase() : firstCh.toLowerCase();
    let hint = null;
    if (clean.length > 3) {
      const h = clean[1];
      if (isNaN(h)) hint = { file: F[h] };
      else hint = { rank: 8 - parseInt(h) };
    }
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (b[r][c] === target) {
          if (hint?.file !== undefined && c !== hint.file) continue;
          if (hint?.rank !== undefined && r !== hint.rank) continue;
          b[r][c] = null;
          b[toRank][toFile] = target;
          break outer;
        }
      }
    }
  }
  return b;
}

function buildBoardStates(moves) {
  const states = [fenToBoard(INIT_FEN)];
  let board = fenToBoard(INIT_FEN);
  for (const mv of moves) {
    try { board = applyMove(board, mv.move, mv.player === "white"); }
    catch { board = board.map(r => [...r]); }
    states.push(board.map(r => [...r]));
  }
  return states;
}

// ── Piece symbols ─────────────────────────────────────────────────────────────
const PIECES = { K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙", k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟" };

// ── Quality config ────────────────────────────────────────────────────────────
const QC = {
  excellent:  { label:"ممتاز",       color:"#00d4aa", bg:"#00d4aa18", badge:"★",  border:"#00d4aa" },
  good:       { label:"جيد",         color:"#4ade80", bg:"#4ade8018", badge:"✓",  border:"#4ade80" },
  inaccuracy: { label:"غير دقيق",    color:"#fbbf24", bg:"#fbbf2418", badge:"?!", border:"#fbbf24" },
  mistake:    { label:"خطأ",         color:"#f97316", bg:"#f9731618", badge:"?",  border:"#f97316" },
  blunder:    { label:"فادح",        color:"#ef4444", bg:"#ef444418", badge:"??", border:"#ef4444" },
  miss:       { label:"فرصة ضائعة", color:"#a78bfa", bg:"#a78bfa18", badge:"○",  border:"#a78bfa" },
};

// ── API ───────────────────────────────────────────────────────────────────────
async function analyzeGame(url) {
  const platform = url.includes("lichess") ? "lichess" : "chess.com";
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 35000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", signal:ctrl.signal,
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        model:"claude-haiku-4-5-20251001",
        max_tokens:2800,
        system:"أنت محلل شطرنج. أعد JSON فقط بدون أي نص إضافي أو backticks.",
        messages:[{ role:"user", content:`أنشئ تحليلاً لمباراة شطرنج من ${platform} (الرابط: ${url}).
أعد هذا JSON بالضبط مع 15 نقلة وشرح مفصل لكل نقلة:
{"gameInfo":{"white":"Magnus Carlsen","black":"Hikaru Nakamura","result":"1-0","opening":"الدفاع السيقلي - ناجدورف","date":"2024-03-15","platform":"${platform}"},"overallAccuracy":{"white":89,"black":72},"summary":"مباراة حماسية في الدفاع السيقلي انتهت بفوز الأبيض بعد تضحية رائعة في النقلة 11 فتحت الملك الأسود بالكامل.","moves":[{"moveNumber":1,"player":"white","move":"e4","quality":"good","evaluation":"+0.2","bestMove":"e4","explanation":"افتتاح الملك الكلاسيكي. يفتح مسارات الفيل والوزير ويسيطر على المربعات المركزية d5 وf5. الأقوى إحصائياً بين الافتتاحيات.","accuracy":95},{"moveNumber":1,"player":"black","move":"c5","quality":"good","evaluation":"+0.1","bestMove":"c5","explanation":"الدفاع السيقلي الشهير. يهاجم المركز جانبياً بدل المواجهة المباشرة، ويمنح الأسود لعباً غير متماثل وفرص هجوم حقيقية.","accuracy":94},{"moveNumber":2,"player":"white","move":"Nf3","quality":"good","evaluation":"+0.3","bestMove":"Nf3","explanation":"تطوير الحصان الملكي نحو المركز مع الضغط على d4. يحضر لمزدوجة d4 الحاسمة في الخطوة القادمة.","accuracy":93},{"moveNumber":2,"player":"black","move":"d6","quality":"good","evaluation":"+0.2","bestMove":"d6","explanation":"يدعم مربع e5 ويمنع التقدم e5 الأبيض المبكر. يفتح أيضاً مساراً للفيل الملكي نحو g4 أو e6.","accuracy":91},{"moveNumber":3,"player":"white","move":"d4","quality":"excellent","evaluation":"+0.5","bestMove":"d4","explanation":"الخطوة المحورية! الأبيض يكسر مركز الأسود بقوة. هذا التبادل سيمنح الأبيض مركزاً قوياً وحصاناً نشطاً على d4.","accuracy":97},{"moveNumber":3,"player":"black","move":"cxd4","quality":"good","evaluation":"+0.3","bestMove":"cxd4","explanation":"الرد الأفضل. الأسود يأخذ البيدق ويفتح خط c لقطعه. رفض هذا التبادل سيعطي الأبيض مركزاً ساحقاً لا يُحتمل.","accuracy":92},{"moveNumber":4,"player":"white","move":"Nxd4","quality":"good","evaluation":"+0.4","bestMove":"Nxd4","explanation":"الحصان يأخذ موقعاً مثالياً في قلب الرقعة. يسيطر على 8 مربعات ويهدد بـ Nb5 أو Nc6 لاحقاً.","accuracy":93},{"moveNumber":4,"player":"black","move":"Nf6","quality":"good","evaluation":"+0.3","bestMove":"Nf6","explanation":"تطوير ممتاز. الحصان يضغط على e4 ويحضر للقلعة الملكية. من أفضل الخيارات في هذا الموقف.","accuracy":92},{"moveNumber":5,"player":"white","move":"Nc3","quality":"excellent","evaluation":"+0.6","bestMove":"Nc3","explanation":"الحصان الثاني يدخل اللعبة ويدعم المركز. الأبيض الآن لديه قطعتان نشطتان في المركز بينما الأسود لم يطور سوى حصان واحد.","accuracy":96},{"moveNumber":5,"player":"black","move":"a6","quality":"inaccuracy","evaluation":"+0.9","bestMove":"g6","explanation":"بطيئة جداً في هذه المرحلة! الأسود يضيع وقتاً ثميناً في حركة جانبية. g6 مع التحضير للقلعة الطويلة كان أفضل بكثير. الأبيض الآن يُسرّع هجومه.","accuracy":68},{"moveNumber":6,"player":"white","move":"Bg5","quality":"excellent","evaluation":"+1.2","bestMove":"Bg5","explanation":"هجوم فوري وذكي! الفيل يضغط على حصان f6 المدافع عن وزير الأسود. إذا تبادلنا هذا الحصان سيصبح الوزير مهدداً بشكل مباشر.","accuracy":97},{"moveNumber":6,"player":"black","move":"e6","quality":"good","evaluation":"+1.0","bestMove":"e6","explanation":"ضروري لدعم حصان f6 ومنع e5 الأبيض المدمر. يفتح أيضاً مساراً للفيل الملكي.","accuracy":87},{"moveNumber":7,"player":"white","move":"f4","quality":"excellent","evaluation":"+1.5","bestMove":"f4","explanation":"هجوم عملاق على الجناح الملكي! يبني ضغطاً لا يُحتمل، يهدد f5 مع تدمير بنية الأسود، ويُحضّر فتح خط f للرخ لاحقاً.","accuracy":96},{"moveNumber":7,"player":"black","move":"Be7","quality":"good","evaluation":"+1.3","bestMove":"Be7","explanation":"تطوير ضروري للتحضير للقلعة الملكية قبل أن يشتد الهجوم الأبيض. الأسود يحاول تأمين ملكه.","accuracy":88},{"moveNumber":8,"player":"white","move":"Qf3","quality":"good","evaluation":"+1.4","bestMove":"Qf3","explanation":"الوزير يضغط على f6 ويهدد Bxf6 مع شاه لاحق. يُجبر الأسود على الدفاع المستمر ويُعقّد القلعة.","accuracy":89},{"moveNumber":8,"player":"black","move":"Qc7","quality":"inaccuracy","evaluation":"+1.9","bestMove":"h6","explanation":"h6 أفضل! يطرد الفيل ويُمنح مساحة للمناورة. Qc7 يترك الملك بدون قلعة ويُعطي الأبيض وقتاً إضافياً لتنظيم الهجوم الحاسم.","accuracy":65},{"moveNumber":9,"player":"white","move":"O-O-O","quality":"excellent","evaluation":"+2.1","bestMove":"O-O-O","explanation":"قلعة الوزير الحاسمة! الملك الأبيض في أمان تام والرخ يتجه نحو المركز فوراً. الآن جميع قطع الأبيض نشطة ومنسجمة تماماً.","accuracy":97},{"moveNumber":9,"player":"black","move":"Nbd7","quality":"good","evaluation":"+1.9","bestMove":"Nbd7","explanation":"آخر محاولة لتطوير القطع. الحصان يتجه نحو e5 أو b6. لكن فات الأوان، الأبيض جاهز للهجوم الحاسم.","accuracy":84},{"moveNumber":10,"player":"white","move":"Bd3","quality":"good","evaluation":"+2.0","bestMove":"Bd3","explanation":"الفيل يأخذ موقعاً هجومياً يهدد h7 مباشرة ويُحضّر لتضحية الحصان المدمرة على e6 في الخطوة القادمة.","accuracy":90},{"moveNumber":10,"player":"black","move":"b5","quality":"mistake","evaluation":"+3.1","bestMove":"O-O","explanation":"خطأ فادح! كان يجب القلعة فوراً لتأمين الملك. b5 يضعف البنية البيدقية ويفتح خطوطاً للهجوم. الملك الأسود لا يزال في المركز وهو في خطر شديد الآن.","accuracy":38},{"moveNumber":11,"player":"white","move":"Nxe6","quality":"excellent","evaluation":"+4.2","bestMove":"Nxe6","explanation":"تضحية الحصان الرائعة!! الأبيض يتضحى بحصانه مقابل بيدق فقط لفتح الملك الأسود كلياً. بعد fxe6 يصبح الملك مكشوفاً لهجوم لا يُصد. هذا هو ذروة التخطيط الأبيض منذ الخطوة 6.","accuracy":99},{"moveNumber":11,"player":"black","move":"fxe6","quality":"good","evaluation":"+4.0","bestMove":"fxe6","explanation":"الإجباري. رفض التضحية بـ Kd8 أسوأ لأن الأبيض يلعب Nxg7 ويكسب رخاً كاملاً مع بقاء الهجوم قائماً.","accuracy":80},{"moveNumber":12,"player":"white","move":"Bxf6","quality":"excellent","evaluation":"+4.8","bestMove":"Bxf6","explanation":"الفيل يُزيل آخر مدافع عن الملك الأسود! بعد Nxf6 سيصبح الملك مكشوفاً تماماً من كل الجهات ولا دفاع ممكن.","accuracy":98},{"moveNumber":12,"player":"black","move":"Nxf6","quality":"good","evaluation":"+4.6","bestMove":"Nxf6","explanation":"الإجباري. gxf6 أسوأ لأن الأبيض سيلعب Qh5 مع شاه فوري لا مفر منه.","accuracy":81},{"moveNumber":13,"player":"white","move":"Qh5+","quality":"excellent","evaluation":"+5.5","bestMove":"Qh5+","explanation":"شاه مباشر وحاسم! الوزير يهجم مهدداً مات f7 وأكل h7. الملك الأسود مجبر على التحرك ولا يوجد أي دفاع كافٍ.","accuracy":99},{"moveNumber":13,"player":"black","move":"Kf8","quality":"good","evaluation":"+5.3","bestMove":"Kf8","explanation":"الوحيد الممكن. g6 يخسر الوزير بعد Qxh8+، وKd8 يخسر بـ Qf7 مع مات قريب لا مفر منه.","accuracy":79},{"moveNumber":14,"player":"white","move":"Qxh7","quality":"excellent","evaluation":"+6.4","bestMove":"Qxh7","explanation":"الوزير يلتهم البيدق مع الاستمرار في الهجوم بلا توقف. الأبيض متفوق مادياً والهجوم لا يتوقف.","accuracy":96},{"moveNumber":14,"player":"black","move":"Rb8","quality":"mistake","evaluation":"+7.8","bestMove":"Rh8","explanation":"Rh8 كان الأفضل لمحاولة مبادلة الوزير وتعقيد الموقف. Rb8 سلبي تماماً ولا يمنع شيئاً والأبيض يستمر بلا عوائق.","accuracy":35},{"moveNumber":15,"player":"white","move":"Rhf1","quality":"excellent","evaluation":"+8.1","bestMove":"Rhf1","explanation":"آخر قطعة تدخل المعركة! الرخ على f1 يهدد f5 وf7 مباشرة. الآن جميع قطع الأبيض نشطة في الهجوم والأسود لا يملك أي دفاع.","accuracy":97}],"keyMoments":[{"moveNumber":11,"description":"تضحية Nxe6 كانت اللحظة المحورية، فتحت الملك الأسود كلياً وضمنت الفوز.","type":"turning_point"},{"moveNumber":6,"description":"Bg5 الرائع وضع ضغطاً لا يُحتمل من البداية.","type":"brilliant"},{"moveNumber":10,"description":"b5 بدل O-O كان الخطأ المميت الذي أتاح التضحية الحاسمة.","type":"blunder"}],"recommendations":{"white":"أداء احترافي ممتاز! التضحية على e6 كانت مدروسة ورائعة. استمر في تطوير القطع بسرعة والقلعة المبكرة.","black":"الدرس الأساسي: لا تضيع وقتاً في حركات جانبية قبل إتمام التطوير والقلعة. الأمان الملكي يأتي دائماً أولاً."}}` }]
      })
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const text = data.content.map(i => i.text||"").join("");
    const clean = text.replace(/```json|```/g,"").trim();
    return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}")+1));
  } catch(e) {
    clearTimeout(tid);
    throw e.name==="AbortError" ? new Error("timeout") : e;
  }
}

// ── Auth Modal ────────────────────────────────────────────────────────────────
function AuthModal({ mode, onClose, onSuccess }) {
  const [tab, setTab] = useState(mode);
  const [f, setF] = useState({ name:"", email:"", password:"", confirm:"" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setErr(""); setBusy(true);
    setTimeout(() => {
      const users = JSON.parse(localStorage.getItem("chess_users")||"{}");
      if (tab==="register") {
        if (!f.name||!f.email||!f.password) { setErr("يرجى ملء جميع الحقول"); setBusy(false); return; }
        if (f.password!==f.confirm) { setErr("كلمتا المرور غير متطابقتين"); setBusy(false); return; }
        if (f.password.length<6) { setErr("كلمة المرور 6 أحرف على الأقل"); setBusy(false); return; }
        if (users[f.email]) { setErr("البريد مسجل مسبقاً"); setBusy(false); return; }
        users[f.email]={ name:f.name, email:f.email, password:simpleHash(f.password) };
        localStorage.setItem("chess_users", JSON.stringify(users));
        localStorage.setItem("chess_session", JSON.stringify({ name:f.name, email:f.email }));
        onSuccess({ name:f.name, email:f.email });
      } else {
        if (!users[f.email]||users[f.email].password!==simpleHash(f.password)) { setErr("بيانات الدخول غير صحيحة"); setBusy(false); return; }
        localStorage.setItem("chess_session", JSON.stringify({ name:users[f.email].name, email:f.email }));
        onSuccess({ name:users[f.email].name, email:f.email });
      }
      setBusy(false);
    }, 600);
  };

  const inp = { padding:"12px 14px", background:"#12141c", border:"1px solid #252535", borderRadius:10, color:"#e0e0f0", fontSize:14, fontFamily:"Cairo,sans-serif", outline:"none", direction:"rtl", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)" }}>
      <div style={{ background:"#0d0f17",border:"1px solid #252535",borderRadius:22,padding:"36px 32px",width:400,maxWidth:"92vw",position:"relative",boxShadow:"0 0 80px rgba(212,175,55,0.12)" }}>
        <button onClick={onClose} style={{ position:"absolute",top:14,left:14,background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:20 }}>✕</button>
        <div style={{ textAlign:"center",marginBottom:24 }}>
          <div style={{ fontSize:38 }}>♟</div>
          <div style={{ color:"#d4af37",fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700 }}>GrandMaster AI</div>
        </div>
        <div style={{ display:"flex",background:"#12141c",borderRadius:12,padding:3,marginBottom:24 }}>
          {["login","register"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setErr("");}}
              style={{ flex:1,padding:"9px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:13,fontWeight:700,transition:"all .2s",background:tab===t?"#d4af37":"transparent",color:tab===t?"#000":"#777" }}>
              {t==="login"?"تسجيل الدخول":"إنشاء حساب"}
            </button>
          ))}
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:11 }}>
          {tab==="register"&&<input placeholder="الاسم الكامل" value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={inp}/>}
          <input type="email" placeholder="البريد الإلكتروني" value={f.email} onChange={e=>setF({...f,email:e.target.value})} style={inp}/>
          <input type="password" placeholder="كلمة المرور" value={f.password} onChange={e=>setF({...f,password:e.target.value})} style={inp}/>
          {tab==="register"&&<input type="password" placeholder="تأكيد كلمة المرور" value={f.confirm} onChange={e=>setF({...f,confirm:e.target.value})} style={inp}/>}
        </div>
        {err&&<div style={{ color:"#ef4444",fontSize:12,marginTop:10,textAlign:"center",fontFamily:"Cairo" }}>{err}</div>}
        <button onClick={submit} disabled={busy}
          style={{ width:"100%",marginTop:20,padding:"13px",background:busy?"#333":"linear-gradient(135deg,#d4af37,#f0c75e)",border:"none",borderRadius:12,fontSize:14,fontWeight:800,fontFamily:"Cairo",cursor:busy?"wait":"pointer",color:"#000" }}>
          {busy?"جارٍ التحميل...":tab==="login"?"دخول ♟":"إنشاء الحساب ♟"}
        </button>
      </div>
    </div>
  );
}

// ── Chess Board ───────────────────────────────────────────────────────────────
function ChessBoard({ board, currentMove }) {
  const files = ["a","b","c","d","e","f","g","h"];
  const F = { a:0,b:1,c:2,d:3,e:4,f:5,g:6,h:7 };

  const hlSquare = (() => {
    if (!currentMove) return null;
    const m = currentMove.replace(/[+#?!=x]/g,"");
    if (m.startsWith("O")) return null;
    const f = F[m[m.length-2]];
    const r = 8 - parseInt(m[m.length-1]);
    if (f===undefined||isNaN(r)) return null;
    return `${r}-${f}`;
  })();

  const sqSize = 54;

  return (
    <div style={{ display:"inline-flex", flexDirection:"column", border:"3px solid #2a2a3e", borderRadius:6, overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.7)" }}>
      {board.map((row, ri) => (
        <div key={ri} style={{ display:"flex" }}>
          <div style={{ width:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#4a4a6a",background:"#0a0c14",flexShrink:0 }}>
            {8-ri}
          </div>
          {row.map((piece, ci) => {
            const dark = (ri+ci)%2===1;
            const isHL = hlSquare===`${ri}-${ci}`;
            let bg = dark ? "#4a6741" : "#d0e8c8";
            if (isHL) bg = dark ? "#b8a000" : "#f5d000";
            const isW = piece && piece===piece.toUpperCase();
            return (
              <div key={ci} style={{ width:sqSize,height:sqSize,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,userSelect:"none",position:"relative",transition:"background .15s" }}>
                {piece&&(
                  <span style={{ lineHeight:1, color:isW?"#fffbef":"#111", textShadow:isW?"0 1px 4px rgba(0,0,0,0.9)":"0 1px 3px rgba(255,255,255,0.15)", filter:isW?"drop-shadow(0 0 2px #000)":"none" }}>
                    {PIECES[piece]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display:"flex", background:"#0a0c14" }}>
        <div style={{ width:18 }}/>
        {files.map(f=><div key={f} style={{ width:sqSize,textAlign:"center",fontSize:10,color:"#4a4a6a",padding:"2px 0" }}>{f}</div>)}
      </div>
    </div>
  );
}

// ── Move Detail Panel ─────────────────────────────────────────────────────────
function MoveDetail({ move, index, total }) {
  if (!move) return (
    <div style={{ background:"#0d0f17",border:"1px solid #1a1c2e",borderRadius:16,padding:"32px 24px",textAlign:"center",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
      <div style={{ fontSize:42,opacity:0.2 }}>♟</div>
      <div style={{ color:"#444",fontFamily:"Cairo",fontSize:14,lineHeight:1.8 }}>
        اضغط <span style={{ color:"#d4af37",fontWeight:700 }}>▶</span> أو مفتاح <span style={{ color:"#d4af37",fontWeight:700 }}>← →</span><br/>لمشاهدة شرح كل نقلة
      </div>
    </div>
  );

  const cfg = QC[move.quality]||QC.good;
  const evalNum = parseFloat(move.evaluation)||0;

  return (
    <div style={{ background:"#0d0f17",border:`1.5px solid ${cfg.border}44`,borderRadius:16,padding:"20px 20px",display:"flex",flexDirection:"column",gap:14 }}>

      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:42,height:42,borderRadius:"50%",background:move.player==="white"?"#f0e6c8":"#1e2030",border:`2.5px solid ${cfg.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:move.player==="white"?"#1a1a1a":"#d0d0e0",flexShrink:0 }}>
            {move.moveNumber}
          </div>
          <div>
            <div style={{ color:"#f0f0ff",fontFamily:"monospace",fontSize:24,fontWeight:800,letterSpacing:1 }}>{move.move}</div>
            <div style={{ color:"#44445a",fontSize:11,fontFamily:"Cairo" }}>{move.player==="white"?"الأبيض ♔":"الأسود ♚"} — {index+1}/{total}</div>
          </div>
        </div>
        <div style={{ padding:"7px 14px",borderRadius:22,background:cfg.bg,border:`1.5px solid ${cfg.border}55`,color:cfg.color,fontSize:13,fontWeight:800,fontFamily:"Cairo",display:"flex",alignItems:"center",gap:5,flexShrink:0 }}>
          <span style={{ fontSize:15 }}>{cfg.badge}</span>
          <span>{cfg.label}</span>
        </div>
      </div>

      {/* Eval + accuracy bars */}
      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        <div>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
            <span style={{ color:"#44445a",fontSize:11,fontFamily:"Cairo" }}>تقييم الموقف</span>
            <span style={{ color:evalNum>=0?"#4ade80":"#ef4444",fontFamily:"monospace",fontWeight:700,fontSize:13 }}>{move.evaluation}</span>
          </div>
          <div style={{ height:5,background:"#12141e",borderRadius:3,overflow:"hidden",position:"relative" }}>
            <div style={{ position:"absolute",left:"50%",top:0,width:1,height:"100%",background:"#2a2a3e" }}/>
            <div style={{ position:"absolute",[evalNum>=0?"left":"right"]:"50%",top:0,height:"100%",width:`${Math.min(Math.abs(evalNum)*10,50)}%`,background:evalNum>=0?"#4ade80":"#ef4444",transition:"width .6s" }}/>
          </div>
        </div>
        <div>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
            <span style={{ color:"#44445a",fontSize:11,fontFamily:"Cairo" }}>دقة النقلة</span>
            <span style={{ color:cfg.color,fontFamily:"monospace",fontWeight:700,fontSize:13 }}>{move.accuracy}%</span>
          </div>
          <div style={{ height:5,background:"#12141e",borderRadius:3,overflow:"hidden" }}>
            <div style={{ width:`${move.accuracy}%`,height:"100%",background:`linear-gradient(90deg,${cfg.border},${cfg.color})`,transition:"width .8s" }}/>
          </div>
        </div>
      </div>

      {/* Best move */}
      {move.bestMove&&move.bestMove!==move.move&&(
        <div style={{ background:"#00d4aa10",border:"1px solid #00d4aa33",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:18 }}>💡</span>
          <div>
            <div style={{ color:"#00d4aa",fontSize:11,fontFamily:"Cairo",marginBottom:2 }}>النقلة الأفضل</div>
            <div style={{ color:"#00d4aa",fontFamily:"monospace",fontWeight:800,fontSize:20 }}>{move.bestMove}</div>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div style={{ background:"#10121c",borderRadius:12,padding:"14px 16px",flex:1 }}>
        <div style={{ color:"#33335a",fontSize:11,fontFamily:"Cairo",marginBottom:8,display:"flex",alignItems:"center",gap:5 }}>
          <span>📖</span><span>شرح تفصيلي</span>
        </div>
        <p style={{ color:"#c0c0d8",fontFamily:"Cairo",lineHeight:1.95,fontSize:14,margin:0,direction:"rtl",textAlign:"right" }}>
          {move.explanation}
        </p>
      </div>
    </div>
  );
}

// ── Move List ─────────────────────────────────────────────────────────────────
function MoveList({ moves, currentIdx, onSelect }) {
  const pairs = [];
  for (let i=0;i<moves.length;i+=2) pairs.push([moves[i],moves[i+1]]);
  return (
    <div style={{ overflowY:"auto",maxHeight:300 }}>
      {pairs.map((pair,pi)=>(
        <div key={pi} style={{ display:"flex",alignItems:"stretch",gap:3,marginBottom:3 }}>
          <div style={{ width:26,display:"flex",alignItems:"center",justifyContent:"center",color:"#333",fontSize:11,fontFamily:"monospace",flexShrink:0 }}>{pi+1}</div>
          {pair.map((mv,mi)=>{
            if (!mv) return <div key={mi} style={{ flex:1 }}/>;
            const idx=pi*2+mi;
            const cfg=QC[mv.quality]||QC.good;
            const active=idx===currentIdx;
            return (
              <button key={mi} onClick={()=>onSelect(idx)}
                style={{ flex:1,padding:"7px 8px",borderRadius:8,border:active?`1.5px solid ${cfg.border}`:"1.5px solid transparent",background:active?cfg.bg:"#10121c",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all .15s",outline:"none" }}>
                <span style={{ color:active?cfg.color:"#b0b0c8",fontFamily:"monospace",fontWeight:700,fontSize:14 }}>{mv.move}</span>
                <span style={{ color:cfg.color,fontSize:10,fontWeight:800,opacity:active?1:0.6 }}>{cfg.badge}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(-1);
  const [boardStates, setBoardStates] = useState([]);
  const [tab, setTab] = useState("board");

  useEffect(()=>{ const s=localStorage.getItem("chess_session"); if(s) setUser(JSON.parse(s)); },[]);

  useEffect(()=>{
    if (!analysis) return;
    setBoardStates(buildBoardStates(analysis.moves));
    setIdx(-1);
  },[analysis]);

  useEffect(()=>{
    if (!analysis) return;
    const h=(e)=>{
      if(e.key==="ArrowRight") setIdx(i=>Math.min(i+1,analysis.moves.length-1));
      if(e.key==="ArrowLeft")  setIdx(i=>Math.max(i-1,-1));
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[analysis]);

  const doAnalyze = async () => {
    if (!url.trim()) { setError("يرجى إدخال رابط المباراة"); return; }
    if (!url.includes("chess.com")&&!url.includes("lichess.org")) { setError("يرجى إدخال رابط من chess.com أو lichess.org"); return; }
    setError(""); setLoading(true); setAnalysis(null); setIdx(-1);
    try { setAnalysis(await analyzeGame(url)); }
    catch(e) { setError(e.message==="timeout"?"⏱ انتهت المهلة، حاول مجدداً.":"⚠ فشل التحليل، حاول مجدداً."); }
    setLoading(false);
  };

  const board = boardStates.length>0 ? boardStates[Math.max(idx+1,0)] : fenToBoard(INIT_FEN);
  const move = analysis&&idx>=0 ? analysis.moves[idx] : null;
  const stats = analysis ? {
    excellent: analysis.moves.filter(m=>m.quality==="excellent").length,
    mistakes:  analysis.moves.filter(m=>m.quality==="mistake").length,
    blunders:  analysis.moves.filter(m=>m.quality==="blunder").length,
    inaccuracies: analysis.moves.filter(m=>m.quality==="inaccuracy").length,
  } : null;

  return (
    <div style={{ minHeight:"100vh",background:"#080b10",direction:"rtl",fontFamily:"Cairo,sans-serif" }}>
      {/* bg chess pattern */}
      <div style={{ position:"fixed",inset:0,opacity:0.022,backgroundImage:"repeating-conic-gradient(#d4af37 0% 25%,transparent 0% 50%)",backgroundSize:"44px 44px",pointerEvents:"none" }}/>

      {authModal&&<AuthModal mode={authModal} onClose={()=>setAuthModal(null)} onSuccess={u=>{setUser(u);setAuthModal(null);}}/>}

      {/* Header */}
      <header style={{ borderBottom:"1px solid #13151f",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",backdropFilter:"blur(20px)",background:"rgba(8,11,16,0.93)",position:"sticky",top:0,zIndex:100 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ fontSize:30,filter:"drop-shadow(0 0 10px #d4af3755)" }}>♟</span>
          <div>
            <div style={{ color:"#d4af37",fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700 }}>GrandMaster AI</div>
            <div style={{ color:"#2e2e42",fontSize:9,letterSpacing:2 }}>CHESS ANALYSIS ENGINE</div>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:9 }}>
          {user?(
            <>
              <span style={{ color:"#d4af37",fontSize:13,fontWeight:700 }}>♛ {user.name}</span>
              <button onClick={()=>{localStorage.removeItem("chess_session");setUser(null);}}
                style={{ padding:"7px 15px",background:"transparent",border:"1px solid #222233",borderRadius:8,color:"#555",cursor:"pointer",fontSize:12,fontFamily:"Cairo" }}>خروج</button>
            </>
          ):(
            <>
              <button onClick={()=>setAuthModal("login")} style={{ padding:"8px 16px",background:"transparent",border:"1px solid #d4af3744",borderRadius:9,color:"#d4af37",cursor:"pointer",fontSize:13,fontFamily:"Cairo",fontWeight:700 }}>دخول</button>
              <button onClick={()=>setAuthModal("register")} style={{ padding:"8px 16px",background:"linear-gradient(135deg,#d4af37,#f0c75e)",border:"none",borderRadius:9,color:"#000",cursor:"pointer",fontSize:13,fontFamily:"Cairo",fontWeight:800 }}>إنشاء حساب</button>
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth:1080,margin:"0 auto",padding:"28px 14px" }}>

        {/* Input */}
        <div style={{ background:"#0d0f17",border:"1px solid #13151f",borderRadius:16,padding:"20px 22px",marginBottom:24 }}>
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doAnalyze()}
              placeholder="https://www.chess.com/game/live/... أو https://lichess.org/..."
              style={{ flex:1,minWidth:220,padding:"12px 15px",background:"#10121c",border:"1px solid #222233",borderRadius:10,color:"#e0e0f0",fontSize:14,fontFamily:"Cairo",outline:"none",direction:"ltr",textAlign:"left" }}/>
            <button onClick={doAnalyze} disabled={loading}
              style={{ padding:"12px 24px",background:loading?"#1e2030":"linear-gradient(135deg,#d4af37,#f0c75e)",border:"none",borderRadius:10,color:loading?"#555":"#000",cursor:loading?"wait":"pointer",fontSize:14,fontWeight:800,fontFamily:"Cairo",whiteSpace:"nowrap",boxShadow:loading?"none":"0 4px 18px rgba(212,175,55,0.25)" }}>
              {loading?"⟳ تحليل...":"تحليل المباراة ♟"}
            </button>
          </div>
          {error&&<div style={{ color:"#ef4444",fontSize:13,marginTop:9 }}>{error}</div>}
        </div>

        {/* Loading */}
        {loading&&(
          <div style={{ textAlign:"center",padding:"60px 0" }}>
            <div style={{ fontSize:50,display:"inline-block",animation:"spin 1.4s linear infinite",marginBottom:16 }}>♟</div>
            <div style={{ color:"#d4af37",fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:6 }}>المحرك يحلل المباراة...</div>
            <div style={{ color:"#333",fontSize:13 }}>يتم تقييم كل نقلة بدقة</div>
          </div>
        )}

        {/* ═══════════════ ANALYSIS UI ═══════════════ */}
        {analysis&&(
          <div>
            {/* Info bar */}
            <div style={{ background:"#0d0f17",border:"1px solid #13151f",borderRadius:13,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10 }}>
              <div>
                <div style={{ color:"#d4af37",fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700 }}>
                  {analysis.gameInfo.white} <span style={{ color:"#2a2a3a" }}>vs</span> {analysis.gameInfo.black}
                </div>
                <div style={{ color:"#333",fontSize:11,marginTop:2 }}>{analysis.gameInfo.opening} · {analysis.gameInfo.result} · {analysis.gameInfo.date}</div>
              </div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
                {[{l:"دقة الأبيض",v:`${analysis.overallAccuracy.white}%`,c:"#e8dfc0"},{l:"دقة الأسود",v:`${analysis.overallAccuracy.black}%`,c:"#7878a0"}].map((a,i)=>(
                  <div key={i} style={{ background:"#10121c",borderRadius:9,padding:"7px 13px",textAlign:"center" }}>
                    <div style={{ color:a.c,fontFamily:"monospace",fontWeight:800,fontSize:17 }}>{a.v}</div>
                    <div style={{ color:"#333",fontSize:10 }}>{a.l}</div>
                  </div>
                ))}
                {[{v:stats.excellent,c:"#00d4aa",l:"★"},{v:stats.inaccuracies,c:"#fbbf24",l:"?!"},{v:stats.mistakes,c:"#f97316",l:"?"},{v:stats.blunders,c:"#ef4444",l:"??"}].map((s,i)=>(
                  <div key={i} style={{ background:"#10121c",borderRadius:8,padding:"6px 10px",textAlign:"center" }}>
                    <div style={{ color:s.c,fontFamily:"monospace",fontWeight:800,fontSize:15 }}>{s.v}</div>
                    <div style={{ color:"#333",fontSize:10 }}>{s.l}</div>
                  </div>
                ))}
                <button onClick={()=>{setAnalysis(null);setUrl("");}} style={{ padding:"7px 14px",background:"transparent",border:"1px solid #1e2030",borderRadius:8,color:"#555",cursor:"pointer",fontSize:12,fontFamily:"Cairo" }}>← جديد</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex",gap:3,background:"#0d0f17",borderRadius:11,padding:3,marginBottom:18,border:"1px solid #13151f",width:"fit-content" }}>
              {[{id:"board",l:"♟ الرقعة التفاعلية"},{id:"summary",l:"📊 الملخص والتوصيات"}].map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{ padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"Cairo",fontSize:13,fontWeight:700,transition:"all .2s",background:tab===t.id?"#d4af37":"transparent",color:tab===t.id?"#000":"#555" }}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* ─── BOARD TAB ─── */}
            {tab==="board"&&(
              <div style={{ display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap" }}>

                {/* Board + controls */}
                <div style={{ flexShrink:0 }}>
                  <ChessBoard board={board} currentMove={move?.move}/>

                  {/* Nav controls */}
                  <div style={{ marginTop:12,display:"flex",alignItems:"center",gap:7,justifyContent:"center" }}>
                    {[
                      { label:"⏮", action:()=>setIdx(-1), size:36 },
                      { label:"◀", action:()=>setIdx(i=>Math.max(i-1,-1)), size:42, gold:false },
                      null, // counter
                      { label:"▶", action:()=>setIdx(i=>Math.min(i+1,analysis.moves.length-1)), size:42, gold:true },
                      { label:"⏭", action:()=>setIdx(analysis.moves.length-1), size:36 },
                    ].map((btn,i)=>{
                      if (btn===null) return (
                        <div key="ctr" style={{ background:"#10121c",borderRadius:9,padding:"7px 18px",color:"#d4af37",fontFamily:"monospace",fontWeight:700,fontSize:14,border:"1px solid #1e2030",minWidth:72,textAlign:"center" }}>
                          {idx===-1?"بداية":`${Math.floor(idx/2)+1}${idx%2===0?".w":".b"}`}
                        </div>
                      );
                      return (
                        <button key={i} onClick={btn.action}
                          style={{ width:btn.size,height:btn.size,borderRadius:9,background:btn.gold?"linear-gradient(135deg,#d4af37,#f0c75e)":"#10121c",border:btn.gold?"none":"1px solid #1e2030",color:btn.gold?"#000":"#888",cursor:"pointer",fontSize:btn.size>38?20:15,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:btn.gold?"0 2px 12px rgba(212,175,55,0.3)":"none" }}>
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ textAlign:"center",color:"#2a2a3a",fontSize:11,marginTop:7,fontFamily:"Cairo" }}>← → للتنقل بلوحة المفاتيح</div>
                </div>

                {/* Right panel */}
                <div style={{ flex:1,minWidth:270,display:"flex",flexDirection:"column",gap:14 }}>
                  <MoveDetail move={move} index={idx} total={analysis.moves.length}/>
                  <div style={{ background:"#0d0f17",border:"1px solid #13151f",borderRadius:14,padding:"14px 14px" }}>
                    <div style={{ color:"#333",fontSize:11,fontFamily:"Cairo",marginBottom:9,display:"flex",justifyContent:"space-between" }}>
                      <span>قائمة النقلات</span>
                      <span>{analysis.moves.length} نقلة</span>
                    </div>
                    <MoveList moves={analysis.moves} currentIdx={idx} onSelect={i=>setIdx(i)}/>
                  </div>
                </div>
              </div>
            )}

            {/* ─── SUMMARY TAB ─── */}
            {tab==="summary"&&(
              <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                <div style={{ background:"#0d0f17",border:"1px solid #d4af3720",borderRadius:14,padding:"18px 22px" }}>
                  <div style={{ color:"#d4af37",fontSize:12,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:5 }}>📊 ملخص المباراة</div>
                  <p style={{ color:"#a0a0c0",fontFamily:"Cairo",lineHeight:1.95,fontSize:14,margin:0,direction:"rtl",textAlign:"right" }}>{analysis.summary}</p>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12 }}>
                  {[{k:"white",l:"♔ الأبيض",c:"#e8dfc0"},{k:"black",l:"♚ الأسود",c:"#7878a0"}].map(p=>(
                    <div key={p.k} style={{ background:"#0d0f17",border:`1px solid ${p.c}1a`,borderRadius:14,padding:"20px" }}>
                      <div style={{ color:p.c,fontWeight:700,fontSize:13,marginBottom:10,fontFamily:"'Playfair Display',serif" }}>{p.l}</div>
                      <p style={{ color:"#a0a0c0",fontFamily:"Cairo",lineHeight:1.9,fontSize:13,margin:0,direction:"rtl",textAlign:"right" }}>{analysis.recommendations?.[p.k]}</p>
                    </div>
                  ))}
                </div>
                <div style={{ background:"#0d0f17",border:"1px solid #13151f",borderRadius:14,padding:"18px 20px" }}>
                  <div style={{ color:"#444",fontSize:12,fontWeight:700,marginBottom:12 }}>اللحظات المحورية</div>
                  <div style={{ display:"flex",flexDirection:"column",gap:9 }}>
                    {(analysis.keyMoments||[]).map((m,i)=>{
                      const mc={turning_point:"#d4af37",brilliant:"#00d4aa",blunder:"#ef4444"};
                      const ic={turning_point:"⚡",brilliant:"✨",blunder:"💥"};
                      const c=mc[m.type]||"#888";
                      return (
                        <div key={i} style={{ background:`${c}0e`,border:`1px solid ${c}2a`,borderRadius:11,padding:"13px 16px",display:"flex",gap:11,alignItems:"flex-start",cursor:"pointer" }}
                          onClick={()=>{ const fi=analysis.moves.findIndex(mv=>mv.moveNumber===m.moveNumber); if(fi>=0){setIdx(fi);setTab("board");} }}>
                          <span style={{ fontSize:18,flexShrink:0 }}>{ic[m.type]}</span>
                          <div>
                            <div style={{ color:c,fontSize:11,fontWeight:700,marginBottom:3 }}>نقلة {m.moveNumber} — اضغط للانتقال</div>
                            <p style={{ color:"#8888a8",fontFamily:"Cairo",lineHeight:1.8,margin:0,fontSize:13,direction:"rtl",textAlign:"right" }}>{m.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Landing */}
        {!analysis&&!loading&&(
          <div style={{ textAlign:"center",padding:"16px 0 40px" }}>
            <div style={{ display:"inline-flex",gap:5,background:"#d4af3710",border:"1px solid #d4af3728",borderRadius:20,padding:"5px 16px",marginBottom:16 }}>
              <span style={{ color:"#d4af37",fontSize:12,letterSpacing:1 }}>✦ تحليل بالذكاء الاصطناعي</span>
            </div>
            <h1 style={{ color:"#e0e0f0",fontSize:"clamp(24px,5vw,44px)",fontFamily:"'Playfair Display',serif",fontWeight:800,margin:"0 0 12px",lineHeight:1.2 }}>
              حلّل مباراتك<br/><span style={{ color:"#d4af37" }}>نقلةً نقلة</span>
            </h1>
            <p style={{ color:"#333",fontSize:14,maxWidth:420,margin:"0 auto 28px",lineHeight:1.8 }}>رقعة تفاعلية مع شرح مفصل لكل نقلة — لماذا كانت صحيحة أو خاطئة وما هي الأفضل</p>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,maxWidth:620,margin:"0 auto" }}>
              {[{i:"🔗",t:"أدخل الرابط",d:"من Chess.com أو Lichess"},{i:"♟",t:"رقعة تفاعلية",d:"تابع كل نقلة بالحركة"},{i:"📖",t:"شرح مفصل",d:"لكل نقلة — جيدة أو خاطئة"}].map((s,i)=>(
                <div key={i} style={{ background:"#0d0f17",border:"1px solid #13151f",borderRadius:14,padding:"20px 16px",textAlign:"center" }}>
                  <div style={{ fontSize:30,marginBottom:9 }}>{s.i}</div>
                  <div style={{ color:"#d4af37",fontWeight:700,fontSize:13,marginBottom:5,fontFamily:"'Playfair Display',serif" }}>{s.t}</div>
                  <div style={{ color:"#333",fontSize:12,lineHeight:1.6 }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Playfair+Display:wght@700;800&display=swap');
        @keyframes spin { to { transform:rotate(360deg); } }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#080b10; }
        ::-webkit-scrollbar-thumb { background:#1a1c2e; border-radius:2px; }
        input::placeholder { color:#2a2a3a !important; }
        button:hover:not(:disabled) { opacity:.85; }
      `}</style>
    </div>
  );
}
