/* ============================================================================
   DIRECTION C - THE PLATE. Deck renderer.
   Fouta Mark provenance: (c) Boubacar Barry - Fouta Djallon.
   Origin: house-style deck+kit exploration 2026-07-28.
   Registry: agentsHQ/docs/ip/provenance-registry.md

   A drawing set is not 33 drawings. It is a set of SHEET TYPES, and each type
   carries a different amount of apparatus. That is the system.

   APPARATUS LEVELS
     full   sheet border 1.4mm, zone letters A-C / 1-3, seven cell title block.
            Used on 11 sheets: the two covers and the nine blueprint sheets.
     quiet  sheet border 0.35mm, no zone letters, one line strip at the foot.
            Used on the other 22 sheets. This is the default, not the exception.

   SHEET TYPES
     cover     general arrangement drawing + title. Full apparatus.
     print     blueprint. Ground inverts to indigo, lines to cotton. Full.
     notes     specification notes. NO DRAWING. Words only, large, with air.
     schedule  a real drawing register / parts schedule. NO DRAWING. Rules only.
     work      work instruction. Numbered operations. NO DRAWING.
     spec      a specification block, set in the drawing office monospace.
     detail    the one type that requires a drawing.

   DRAWINGS appear on 8 of 33 sheets. The other 25 carry none.
   ========================================================================= */

var SLIDES = [
/* 0 */ {n:0,  t:'cover', fig:'SHEET 00 OF 33', sub:'HOLDING', time:'6:30',
        title:'AI WITHOUT<br>GETTING BURNED', ts:104, draw:'ga6',
        ops:['Get on the wifi.','Go to claude.ai and sign in, or make a free account.','Put your name on a tag so the person next to you knows who you are.'],
        opsIntro:'Grab a seat. Open your laptop. Three things before we start.',
        tb:{Scale:'1:20', Rev:'A', Zone:'ROOM 105'}},

/* 1 */ {n:1,  t:'cover', fig:'SHEET 01 OF 33', sub:'GENERAL ARRANGEMENT', time:'7:00',
        title:'AI WITHOUT<br>GETTING BURNED', ts:118, draw:'ga6',
        lead:'In ninety minutes you build three tools, on your own laptop, that work in any AI you pick up. Tonight’s, next year’s, whatever comes after that.',
        tb:{Scale:'1:20', Rev:'A', Zone:'B1'}},

/* 2 */ {n:2,  t:'schedule', fig:'FIG. 02', sub:'SCOPE', time:'7:01',
        title:'WHAT TONIGHT IS', ts:88,
        twin:[{h:'THIS IS', rows:['Hands-on. Your laptop stays open the whole time.','You build. I am not demoing at you.','Everything you make tonight is yours, and it moves anywhere.']},
              {h:'THIS IS NOT', rows:['A software pitch. I am not selling you a tool.','A coding class. Nobody writes code tonight.','A list of 40 apps you will never open again.'], no:true}],
        close:'If you leave with nothing installed, I did this wrong.'},

/* 3 */ {n:3,  t:'schedule', fig:'FIG. 03', sub:'DRAWING REGISTER', time:'7:03',
        title:'HERE IS THE PLAN', ts:88,
        reg:[['7:00','What AI is, in plain English'],
             ['7:16','Set up your base, so the tool knows your business'],
             ['7:22','Build the Decision Council, the one I use on my own calls'],
             ['7:50','A live look at what this does on a real business'],
             ['8:10','Build the Simplicity Check'],
             ['8:20','What I do next, what you do next, then your questions']],
        close:'Hold your questions. There is a real Q and A at the end and I will stay for it.'},

/* 4 */ {n:4,  t:'notes', fig:'FIG. 04', sub:'GENERAL NOTE', time:'7:05',
        title:'HERE IS HOW OWNERS<br>ACTUALLY GET BURNED', ts:82,
        lead:'The burn is lock-in. It is not the robots.',
        body:['It is picking one tool, wiring your business around it, and then the tool changes, the price moves, or it stops being the one everybody recommends. Now you start over. Again.']},

/* 5 */ {n:5,  t:'print', fig:'FIG. 05', sub:'THE WAY OUT', time:'7:07',
        title:'TOOLS CHANGE.<br>PRINCIPLES DON’T.', ts:106,
        lead:'I went from ChatGPT to Gemini to Claude, and a few others since, and I never lost a step. Not because I picked right. Because what I own is the way I work with these things, and that moves.',
        tb:{Scale:'—', Rev:'1', Zone:'A2'}},

/* 6 */ {n:6,  t:'detail', fig:'FIG. 06', sub:'SIX STRIPS, KEYED', time:'7:09',
        title:'THE SIX THAT TRANSFER', ts:76, draw:'stack6',
        keys:['It predicts from what you give it. <b>What you hand it is the whole job.</b>',
              'Give it your context once. <b>Reuse it forever.</b>',
              'Anything you repeat, <b>turn into a saved recipe you own.</b>',
              'Agentic means it does the work, not just answers you. <b>You delegate.</b>',
              '<b>Pressure-test your thinking</b>, then simplify it.',
              '<b>Own it. Move it.</b> Never get locked in.']},

/* 7 */ {n:7,  t:'notes', fig:'FIG. 07', sub:'GENERAL NOTE', time:'7:11',
        title:'IT IS A PREDICTION MACHINE,<br>NOT A BRAIN', ts:74,
        lead:'Garbage in is not an insult. It is a spec.',
        body:['It reads what you gave it and predicts what should come next, one piece at a time. That is the whole trick.',
              'So a vague ask gets a vague answer. Every time. The fix is on your side of the keyboard.']},

/* 8 */ {n:8,  t:'notes', fig:'FIG. 08', sub:'GENERAL NOTE', time:'7:13',
        title:'“AGENTIC” JUST MEANS<br>IT DOES THE WORK', ts:78,
        lead:'You stop asking. You start delegating.',
        body:['Ask a question, get an answer. That is a chat.',
              'Give it a job, and it goes and does the steps. That is agentic. Same machine, different assignment.']},

/* 9 */ {n:9,  t:'print', fig:'FIG. 09', sub:'BEFORE WE BUILD', time:'7:15',
        title:'NOBODY IS BACKSTAGE', ts:104,
        lead:'The page you registered on and the reminder emails that got you here tonight both run on tools I built and I run myself. I am one person. There is nobody behind the curtain.',
        body:['That is the part I want you to want. Not the chatbot.'],
        tb:{Scale:'—', Rev:'1', Zone:'B2'}},

/* 10 */{n:10, t:'work', fig:'FIG. 10', sub:'WORK INSTRUCTION', time:'7:16',
        title:'DO THIS NOW', ts:104,
        ops:['Open claude.ai.','Make a new Project. Name it after your business.','That is it. Wave if you are stuck and someone will come to you.'],
        close:'Everything else tonight lives inside that project.'},

/* 11 */{n:11, t:'notes', fig:'FIG. 11', sub:'HANDOUT PAGE 3', time:'7:18',
        title:'THE BUSINESS BRAIN', ts:96,
        lead:'Context once. Reused forever. And it moves to any tool you ever switch to.',
        body:['Fill it in once. Paste it in once. From then on every answer comes back about your business, in your voice, with your prices, instead of generic advice for a business that does not exist.']},

/* 12 */{n:12, t:'schedule', fig:'FIG. 12', sub:'SCHEDULE OF PARTS', time:'7:20',
        title:'FILL IN YOUR BRAIN FILE', ts:78,
        lead:'Short answers. Nobody is grading this. Then paste the whole thing into your project instructions.',
        parts:['My business is','My prices are','I sell','My tone is','I sell it to','Things I say a lot, things I never say','The problem I solve is','My weekly repeating tasks are','My biggest goal right now is']},

/* 13 */{n:13, t:'print', fig:'SECTION 02', sub:'THE MAIN EVENT', time:'7:26',
        title:'THE DECISION<br>COUNCIL', ts:118, draw:'band',
        lead:'The thing I actually use on my own calls. You are about to have it too.',
        tb:{Scale:'1:2', Rev:'1', Zone:'B2'}},

/* 14 */{n:14, t:'schedule', fig:'FIG. 14', sub:'SCHEDULE OF PARTS', time:'7:27',
        title:'FIVE ADVISORS. ONE VERDICT.', ts:70,
        reg:[['THE CONTRARIAN','argues hard against you.'],
             ['FIRST PRINCIPLES','names what you are assuming, and which assumption is shaky.'],
             ['THE EXPANSIONIST','describes the bigger version you talked yourself out of.'],
             ['THE OUTSIDER','hears it cold, with zero context, like a smart stranger.'],
             ['THE EXECUTOR','gives you the first move and the thing most likely to kill it.']],
        regw:420,
        close:'Then it has to call it. Proceed, change, or kill.'},

/* 15 */{n:15, t:'spec', fig:'FIG. 15', sub:'SPECIFICATION', time:'7:30',
        title:'PASTE THIS IN', ts:74,
        spec:['You are my Decision Council. When I give you a decision, respond as five',
              'separate advisors, each in one short paragraph:',
              '<b>1. THE CONTRARIAN:</b> argue hard against the decision.',
              '<b>2. FIRST PRINCIPLES:</b> list the assumptions I am making and which ones are shaky.',
              '<b>3. THE EXPANSIONIST:</b> describe a bolder, bigger version of this.',
              '<b>4. THE OUTSIDER:</b> react with zero context, like a smart stranger hearing it cold.',
              '<b>5. THE EXECUTOR:</b> give the first concrete step and the single thing most likely to kill it.',
              'Then finish with VERDICT: proceed, change, or kill, in one sentence, and why.',
              'Be direct. No flattery. Do not agree with me by default.',
              'My decision is: [paste your decision here]'],
        close:'Printed on page 1 of your handout. Type it or copy it.'},

/* 16 */{n:16, t:'work', fig:'FIG. 16', sub:'WORK INSTRUCTION', time:'7:32',
        title:'DO THIS NOW', ts:104,
        ops:['New Project. Name it Decision Council.','Paste the instructions into the project instructions.','Save.'],
        close:'That is the whole install. You now own it.'},

/* 17 */{n:17, t:'work', fig:'FIG. 17', sub:'WORK INSTRUCTION', time:'7:36',
        title:'NOW GIVE IT A REAL ONE', ts:82,
        lead:'Not a test. Not “should I get a dog.” An actual decision sitting on you right now.',
        ops:['Do I hire the second tech or wait.','Do I raise prices in September.','Do I let go of the client who pays late.','Do I sign the lease.'],
        close:'Type it in. Read what comes back. Then tell the person next to you which one stung.'},

/* 18 */{n:18, t:'notes', fig:'FIG. 18', sub:'GENERAL NOTE', time:'7:45',
        title:'THE ONE YOU DIDN’T<br>WANT TO READ', ts:88,
        lead:'If all five agree with you, your decision was probably not a decision.',
        body:['One of those five usually says the thing you have been avoiding. That is the whole point. It has no reason to be nice to you, no job to protect, and no interest in your feelings about it.']},

/* 19 */{n:19, t:'print', fig:'FIG. 19', sub:'REVISION A', time:'7:48',
        title:'ADD ONE LINE', ts:118,
        lead:'Same council. Different job. It tells you how this goes wrong before it costs you anything.',
        body:['Cheapest insurance in business.'],
        tb:{Scale:'—', Rev:'A', Zone:'A1'}},

/* 20 */{n:20, t:'print', fig:'SECTION 03', sub:'WATCH THIS PART', time:'7:50',
        title:'WHAT THIS LOOKS LIKE<br>ON A REAL BUSINESS', ts:86, draw:'band',
        lead:'I am going to point my setup at a business and show you what it finds. Public information only, and not one of yours.',
        tb:{Scale:'1:2', Rev:'1', Zone:'B2'}},

/* 21 */{n:21, t:'print', fig:'FIG. 21', sub:'ONE RACE, TEN MINUTES', time:'8:00',
        title:'ME VERSUS<br>THE MACHINE', ts:118, draw:'band',
        lead:'One task off a real to-do list. I do it by hand. The setup does it beside me. We start at the same time and you watch both.',
        tb:{Scale:'1:2', Rev:'1', Zone:'C2'}},

/* 22 */{n:22, t:'notes', fig:'FIG. 22', sub:'GENERAL NOTE', time:'8:08',
        title:'THAT GAP IS<br>THE OPPORTUNITY', ts:96,
        lead:'Which is a very convenient thing for me to say right before I make you an offer. I will get there. Stay with me.',
        body:['I built that myself, on nights and weekends, and it took a while. You do not need my version. You need the two or three pieces that pay you back first.']},

/* 23 */{n:23, t:'print', fig:'SECTION 04', sub:'TOOL TWO', time:'8:10',
        title:'THE SIMPLICITY<br>CHECK', ts:118, draw:'band',
        lead:'For every time you are about to build something twice as complicated as the job requires.',
        tb:{Scale:'1:2', Rev:'1', Zone:'B2'}},

/* 24 */{n:24, t:'schedule', fig:'FIG. 24', sub:'SCHEDULE OF PARTS', time:'8:11',
        title:'FOUR QUESTIONS', ts:104,
        parts:['Where is this overcomplicated?','What is the simplest version that still works?','Am I skipping the basics?','What can I cut right now?'],
        close:'I run this on myself constantly. It is rude to me weekly.'},

/* 25 */{n:25, t:'work', fig:'FIG. 25', sub:'WORK INSTRUCTION', time:'8:12',
        title:'DO THIS NOW', ts:104,
        ops:['New Project. Name it Simplicity Check.','Paste the instructions from page 2.','Give it something you are currently overbuilding.'],
        close:'Brace yourself for question three.'},

/* 26 */{n:26, t:'schedule', fig:'FIG. 26', sub:'AS BUILT', time:'8:17',
        title:'LOOK WHAT YOU JUST DID', ts:82,
        reg:[['BUSINESS BRAIN','makes every answer about your business.'],
             ['DECISION COUNCIL','pressure-tests your real calls.'],
             ['SIMPLICITY CHECK','cuts what does not need to exist.']],
        regw:420,
        close:'Three things you built yourself, sitting on your own laptop. They work in any tool you switch to, and nobody can take them or price you out of them.'},

/* 27 */{n:27, t:'notes', fig:'FIG. 27', sub:'SAFETY NOTE', time:'8:18',
        title:'A HUMAN APPROVES.<br>THE AI DRAFTS.', ts:96,
        lead:'Nothing that carries your name goes out without you reading it.',
        body:['Not a quote, not a contract, not an email to a customer. That is the brake pedal, and it is the whole safety plan.']},

/* 28 */{n:28, t:'print', fig:'FIG. 28', sub:'THE PART THAT OUTLIVES THE TOOLS', time:'8:19',
        title:'TOOLS CHANGE. PRINCIPLES DON’T.', ts:64,
        parts:['It predicts from what you give it.','Context once, reused forever.','Anything you repeat becomes a recipe you own.','Agentic means you delegate, not just ask.','Pressure-test, then simplify.','Own it. Move it. Never get locked in.'],
        close:'The tools on this screen will look dated. This list will not.',
        tb:{Scale:'—', Rev:'1', Zone:'C1'}},

/* 29 */{n:29, t:'schedule', fig:'FIG. 29', sub:'WHAT HAPPENS NEXT', time:'8:20',
        title:'I WILL DO THIS<br>WITH YOU. FREE.', ts:82,
        parts:['One working session, 45 minutes, just you and me.','I look at how your business actually runs right now.','You leave with a written shortlist: the one place AI pays you back first, and where it is a waste of your money this year.'],
        close:'No deck. No pitch. If the answer is “not yet,” I will say that.'},

/* 30 */{n:30, t:'work', fig:'FIG. 30', sub:'DETAIL, QR TARGET', time:'8:23',
        title:'SCAN. PICK A TIME.', ts:96, draw:'qr',
        body:['Point your phone camera at it. Pick a slot before you stand up.',
              'You will not do it in the parking lot and we both know it.']},

/* 31 */{n:31, t:'detail', fig:'FIG. 31', sub:'ONE MORE THING', time:'8:26',
        title:'THINK OF ONE OWNER', ts:96, draw:'bandkey',
        keys:['One person who should have been in this room tonight. Not a list. One.',
              'Send them the next date. I would rather fill the next room because you told someone than because I bought an ad.']},

/* 32 */{n:32, t:'print', fig:'SHEET 33 OF 33', sub:'ISSUED', time:'8:28',
        title:'ASK ME<br>ANYTHING', ts:124,   /* the last sheet is deliberately
           the empty plate: the set is issued, there is nothing left to draw */
        lead:'I am here until they make me leave.',
        body:['Book the free audit. catalystworks.consulting'],
        tb:{Scale:'1:20', Rev:'B', Zone:'B1'}}
];

/* ---------------------------------------------------------------- helpers */
function d(cls, style, html){ return '<div class="'+cls+'" style="'+style+'">'+(html||'')+'</div>'; }

/* ---------------------------------------------------------------- drawings
   Four drawings, used on nine sheets. Every dimension on them is a real
   arkilla kerka number: strip 220 mm, motif repeat 37 mm, six strips 1320 mm. */

function drawGA6(x, y){                       /* the whole cloth, plan, 1:20 */
  var w = 820, h = 170, s = w/6;
  var o = d('note','left:'+x+'px;top:'+(y-38)+'px','PLAN &nbsp;&middot;&nbsp; ARKILLA KERKA, SIX STRIPS, SCALE 1:20');
  o += d('spec-h','left:'+x+'px;top:'+y+'px;width:'+w+'px;height:var(--lw07)');
  o += d('spec-h','left:'+x+'px;top:'+(y+h)+'px;width:'+w+'px;height:var(--lw07)');
  for (var i=0;i<7;i++){
    var lw = (i===0||i===6) ? 'var(--lw07)' : 'var(--lw035)';
    o += d('spec-v','left:'+(x+i*s)+'px;top:'+y+'px;width:'+lw+';height:'+h+'px');
  }
  /* the sixth strip is the simpler woven one. It gets weave, not motif. */
  o += d('weave','left:'+(x+5*s)+'px;top:'+y+'px;width:'+s+'px;height:'+h+'px');
  for (var j=0;j<5;j++){
    o += d('motif','left:'+(x+30+j*s)+'px;top:'+(y+52)+'px;width:66px;height:66px;'+
      'background:var(--indigo);opacity:'+(j%2 ? '.55' : '.9'));
  }
  o += d('ext','left:'+x+'px;top:'+(y+h+8)+'px;height:56px');
  o += d('ext','left:'+(x+s)+'px;top:'+(y+h+8)+'px;height:56px');
  o += d('ext','left:'+(x+w)+'px;top:'+(y+h+8)+'px;height:56px');
  o += d('dimline','left:'+x+'px;top:'+(y+h+42)+'px;width:'+s+'px');
  o += d('slash','left:'+(x-1)+'px;top:'+(y+h+35)+'px') + d('slash','left:'+(x+s-1)+'px;top:'+(y+h+35)+'px');
  o += d('dimtxt','left:'+(x+30)+'px;top:'+(y+h+31)+'px','220');
  o += d('dimline','left:'+x+'px;top:'+(y+h+84)+'px;width:'+w+'px');
  o += d('slash','left:'+(x-1)+'px;top:'+(y+h+77)+'px') + d('slash','left:'+(x+w-1)+'px;top:'+(y+h+77)+'px');
  o += d('dimtxt','left:'+(x+346)+'px;top:'+(y+h+73)+'px','6 &times; 220 = 1320');
  o += d('note','left:'+x+'px;top:'+(y+h+126)+'px','Sixth strip simpler woven &nbsp;&middot;&nbsp; Dimensions in millimetres');
  return o;
}

function drawBand(x, y, w, quiet){           /* one strip, motif band + section */
  w = w || 560;
  var o = d('note','left:'+x+'px;top:'+(y-36)+'px','PLAN &nbsp;&middot;&nbsp; ONE STRIP, MOTIF BAND, SCALE 1:2');
  o += d('spec-h','left:'+x+'px;top:'+y+'px;width:'+w+'px;height:var(--lw07)');
  o += d('spec-h','left:'+x+'px;top:'+(y+124)+'px;width:'+w+'px;height:var(--lw07)');
  o += d('spec-v','left:'+x+'px;top:'+y+'px;width:var(--lw07);height:124px');
  o += d('spec-v','left:'+(x+w)+'px;top:'+y+'px;width:var(--lw07);height:124px');
  o += d('spec-h','left:'+x+'px;top:'+(y+34)+'px;width:'+w+'px;height:var(--lw018);opacity:.4');
  o += d('spec-h','left:'+x+'px;top:'+(y+90)+'px;width:'+w+'px;height:var(--lw018);opacity:.4');
  for (var i=0;i<6;i++){
    var lx = x + 30 + i*92;
    if (lx + 64 > x + w) break;
    o += d('motif','left:'+lx+'px;top:'+(y+30)+'px;width:64px;height:64px;background:var(--indigo);opacity:'+
           (i%2===0 ? '.92' : '.45'));
  }
  o += d('ext','left:'+x+'px;top:'+(y+132)+'px;height:44px');
  o += d('ext','left:'+(x+92)+'px;top:'+(y+132)+'px;height:44px');
  o += d('dimline','left:'+x+'px;top:'+(y+160)+'px;width:92px');
  o += d('slash','left:'+(x-1)+'px;top:'+(y+153)+'px') + d('slash','left:'+(x+91)+'px;top:'+(y+153)+'px');
  o += d('dimtxt','left:'+(x+14)+'px;top:'+(y+149)+'px','37');
  o += d('note','left:'+x+'px;top:'+(y+204)+'px','SECTION A-A &nbsp;&middot;&nbsp; WARP AND WEFT, SCALE 4:1');
  o += d('spec-h','left:'+x+'px;top:'+(y+242)+'px;width:'+w+'px;height:var(--lw20)');
  o += d('weave','left:'+x+'px;top:'+(y+250)+'px;width:'+w+'px;height:76px');
  o += d('spec-h','left:'+x+'px;top:'+(y+326)+'px;width:'+w+'px;height:var(--lw20)');
  if (!quiet) o += d('note','left:'+x+'px;top:'+(y+356)+'px','Plain weave, cannyudi &nbsp;&middot;&nbsp; Dimensions in millimetres');
  return o;
}

function drawStack6(x, y){        /* the cloth rotated 90 deg. Six is the real
                                     count, which is the only reason this drawing
                                     is allowed to exist on this sheet. */
  var w = 268, pitch = 82, bh = 66;
  var o = d('note','left:'+x+'px;top:'+(y-34)+'px','PLAN &nbsp;&middot;&nbsp; ROTATED 90&deg;, SIX STRIPS, SCALE 1:20');
  for (var i=0;i<6;i++){
    var ty = y + i*pitch;
    o += d('spec-h','left:'+x+'px;top:'+ty+'px;width:'+w+'px;height:var(--lw035)');
    o += d('spec-h','left:'+x+'px;top:'+(ty+bh)+'px;width:'+w+'px;height:var(--lw035)');
    o += d('spec-v','left:'+x+'px;top:'+ty+'px;width:var(--lw07);height:'+bh+'px');
    o += d('spec-v','left:'+(x+w)+'px;top:'+ty+'px;width:var(--lw07);height:'+bh+'px');
    if (i===5) o += d('weave','left:'+x+'px;top:'+ty+'px;width:'+w+'px;height:'+bh+'px');
    else o += d('motif','left:'+(x+w/2-26)+'px;top:'+(ty+10)+'px;width:52px;height:52px;'+
                 'background:var(--indigo);opacity:'+(i%2 ? '.55' : '.9'));
    /* leader from the strip out to its numeral */
    o += d('lead-h','left:'+(x+w)+'px;top:'+(ty+bh/2)+'px;width:44px');
    o += d('ref','left:'+(x+w+52)+'px;top:'+(ty+bh/2-17)+'px', String(i+1));
  }
  o += d('ext','left:'+(x-8)+'px;top:'+y+'px;height:'+(5*pitch+bh)+'px;opacity:.28');
  o += d('note','left:'+x+'px;top:'+(y+5*pitch+bh+16)+'px','Sixth strip simpler woven &nbsp;&middot;&nbsp; 6 &times; 220 = 1320');
  return o;
}

function drawQR(x, y){                      /* a detail with a real dimension */
  var s = 300;
  var o = d('note','left:'+x+'px;top:'+(y-36)+'px','DETAIL &nbsp;&middot;&nbsp; SCAN TARGET, SCALE 1:1');
  o += d('spec-h','left:'+x+'px;top:'+y+'px;width:'+s+'px;height:var(--lw07)');
  o += d('spec-h','left:'+x+'px;top:'+(y+s)+'px;width:'+s+'px;height:var(--lw07)');
  o += d('spec-v','left:'+x+'px;top:'+y+'px;width:var(--lw07);height:'+s+'px');
  o += d('spec-v','left:'+(x+s)+'px;top:'+y+'px;width:var(--lw07);height:'+s+'px');
  o += d('hatch','left:'+(x+2)+'px;top:'+(y+2)+'px;width:'+(s-2)+'px;height:'+(s-2)+'px;opacity:.5');
  o += d('note','left:'+(x+70)+'px;top:'+(y+s/2-10)+'px;font-size:16px','QR CODE, LIVE ARTWORK');
  o += d('ext','left:'+x+'px;top:'+(y+s+8)+'px;height:48px');
  o += d('ext','left:'+(x+s)+'px;top:'+(y+s+8)+'px;height:48px');
  o += d('dimline','left:'+x+'px;top:'+(y+s+38)+'px;width:'+s+'px');
  o += d('slash','left:'+(x-1)+'px;top:'+(y+s+31)+'px') + d('slash','left:'+(x+s-1)+'px;top:'+(y+s+31)+'px');
  o += d('dimtxt','left:'+(x+s/2-28)+'px;top:'+(y+s+27)+'px','80');
  return o;
}

/* -------------------------------------------------------------- apparatus */

function apparatusFull(s){
  var o = d('sheetborder','') + d('sheetinner','');
  o += d('ztick','left:26px;top:300px;width:32px;height:var(--lw018)');
  o += d('ztick','left:26px;top:600px;width:32px;height:var(--lw018)');
  o += d('ztick','left:566px;top:26px;width:var(--lw018);height:32px');
  o += d('ztick','left:1096px;top:26px;width:var(--lw018);height:32px');
  o += d('zone','left:38px;top:172px','A') + d('zone','left:38px;top:442px','B') + d('zone','left:38px;top:742px','C');
  o += d('zone','left:300px;top:34px','1') + d('zone','left:826px;top:34px','2') + d('zone','left:1346px;top:34px','3');
  var tb = s.tb || {};
  o += '<div class="titleblock">'
    + '<div class="tbwide"><span>Title</span><b>' + s.title.replace(/<br>/g,' ') + '</b></div>'
    + '<div><span>Time</span><b>' + s.time + '</b></div>'
    + '<div><span>Sheet</span><b>' + (s.n<10?'0':'') + s.n + ' OF 33</b></div>'
    + '<div><span>Rev</span><b>' + (tb.Rev||'1') + '</b></div>'
    + '<div><span>Scale</span><b>' + (tb.Scale||'—') + '</b></div>'
    + '<div><span>Zone</span><b>' + (tb.Zone||'B2') + '</b></div>'
    + '<div><span>Drawn</span><b>BOUBACAR</b></div>'
    + '</div>';
  return o;
}

function apparatusQuiet(s){
  /* the border thins from 1.4 mm to 0.35 mm, the zone letters come off, and the
     title block collapses to one line along the foot. Same sheet, less furniture. */
  var o = d('sheetborder thin','');
  o += d('spec-h','left:88px;top:796px;width:1424px;height:var(--lw018);opacity:.5');
  o += d('note','left:88px;top:810px','SHEET ' + (s.n<10?'0':'') + s.n + ' OF 33');
  o += d('note','left:756px;top:810px', s.sub || '');
  o += d('note','left:1400px;top:810px;width:112px;text-align:right', s.time);
  return o;
}

/* ------------------------------------------------------------ sheet bodies */

function head(s, topFig, topTitle){
  var o = d('figno','left:88px;top:'+topFig+'px', s.fig + (s.sub ? ' &nbsp;&middot;&nbsp; ' + s.sub : ''));
  o += d('figtitle','left:84px;top:'+topTitle+'px;font-size:'+s.ts+'px', s.title);
  return o;
}

function bodyNotes(s){
  /* NO DRAWING. This is what direction C looks like on a sheet with nothing to
     draw, and it is the most common sheet in the set. */
  var o = head(s, 96, 138);
  var lines = (s.title.match(/<br>/g)||[]).length + 1;
  var y = 138 + lines * s.ts * 0.94 + 64;
  o += d('spec-h','left:88px;top:'+y+'px;width:520px;height:var(--lw07)');
  y += 46;
  if (s.lead){ o += d('keytxt big','left:88px;top:'+y+'px;width:1180px', s.lead); y += Math.ceil(s.lead.length/62)*62 + 34; }
  (s.body||[]).forEach(function(p){
    o += d('keytxt','left:88px;top:'+y+'px;width:1080px', p);
    y += Math.ceil(p.length/72)*48 + 26;
  });
  return o;
}

function bodySchedule(s){
  /* NO DRAWING. A parts schedule is already a drawing office document. */
  var o = head(s, 96, 138);
  var lines = (s.title.match(/<br>/g)||[]).length + 1;
  var y = 138 + lines * s.ts * 0.94 + 40;
  var y2 = 0;
  if (s.lead){
    o += d('keytxt big','left:88px;top:'+y+'px;width:1300px;font-size:36px', s.lead);
    y += Math.ceil(s.lead.length/58)*48 + 44;
  }

  if (s.twin){
    /* two columns of a schedule share one row pitch, or they stop being a table */
    var cw = 640, gap = 104;
    var rows = s.twin[0].rows.length;
    var pitch = [];
    for (var ri=0; ri<rows; ri++){
      var h = 0;
      s.twin.forEach(function(col){ h = Math.max(h, Math.ceil(col.rows[ri].length/38)*46 + 34); });
      pitch.push(h);
    }
    s.twin.forEach(function(col, ci){
      var cx = 88 + ci * (cw + gap);
      o += d('note','left:'+cx+'px;top:'+y+'px;'+(col.no?'color:var(--oxide);opacity:1':''), col.h);
      o += d('spec-h','left:'+cx+'px;top:'+(y+26)+'px;width:'+cw+'px;height:var(--lw07)');
      var ry = y + 44;
      col.rows.forEach(function(r, ri){
        o += d('keytxt','left:'+cx+'px;top:'+ry+'px;width:'+cw+'px;font-size:32px', r);
        ry += pitch[ri];
        o += d('spec-h','left:'+cx+'px;top:'+(ry-16)+'px;width:'+cw+'px;height:var(--lw018);opacity:.45');
      });
    });
    y += 44 + pitch.reduce(function(a,b){return a+b;},0) + 26;
  }

  if (s.reg){
    var lw = s.regw || 120;
    o += d('spec-h','left:88px;top:'+y+'px;width:1424px;height:var(--lw07)');
    y += 22;
    s.reg.forEach(function(r){
      o += d('regkey','left:88px;top:'+(y+4)+'px;width:'+lw+'px', r[0]);
      o += d('keytxt','left:'+(88+lw+34)+'px;top:'+y+'px;width:'+(1390-lw-34)+'px;font-size:34px', r[1]);
      y += Math.max(58, Math.ceil(r[1].length/58)*46 + 22);
      o += d('spec-h','left:88px;top:'+(y-14)+'px;width:1424px;height:var(--lw018);opacity:.45');
    });
    y += 22;
  }

  if (s.parts){
    /* a long schedule goes to two columns. A parts schedule has always done
       this; a single column of nine runs off the bottom of any sheet. */
    var two = s.parts.length > 6;
    var colw = two ? 680 : 1424;
    var per = two ? Math.ceil(s.parts.length/2) : s.parts.length;
    for (var c=0; c<(two?2:1); c++){
      var cx = 88 + c*(colw + 64);
      o += d('spec-h','left:'+cx+'px;top:'+y+'px;width:'+colw+'px;height:var(--lw07)');
      var py = y + 20;
      s.parts.slice(c*per, c*per+per).forEach(function(pt, i){
        var idx = c*per + i + 1;
        var nn = idx < 10 ? '0'+idx : ''+idx;
        o += d('regkey','left:'+cx+'px;top:'+(py+4)+'px;width:64px', nn);
        var fs = (two && pt.length > 34) ? 30 : 34;
        o += d('keytxt','left:'+(cx+76)+'px;top:'+(py + (fs<34?3:0))+'px;width:'+(colw-76)+'px;font-size:'+fs+'px', pt);
        py += 62;
        o += d('spec-h','left:'+cx+'px;top:'+(py-12)+'px;width:'+colw+'px;height:var(--lw018);opacity:.45');
      });
      if (c === 0 || !two) y2 = py;
      y2 = Math.max(y2 || 0, py);
    }
    y = y2 + 22;
  }

  if (s.close) o += d('keytxt big','left:88px;top:'+Math.min(y+6, 700)+'px;width:1300px;font-size:36px', s.close);
  return o;
}

function bodyWork(s){
  /* NO DRAWING unless the slide names one. Operations get the oxide numeral,
     which is the same reference numeral the drawings use. */
  var o = head(s, 96, 138);
  var lines = (s.title.match(/<br>/g)||[]).length + 1;
  var y = 138 + lines * s.ts * 0.94 + 52;
  var right = s.draw ? 900 : 1424;
  if (s.opsIntro){ o += d('keytxt','left:88px;top:'+y+'px;width:1180px', s.opsIntro); y += 76; }
  if (s.lead){ o += d('keytxt big','left:88px;top:'+y+'px;width:1180px;font-size:40px', s.lead); y += Math.ceil(s.lead.length/58)*54 + 34; }
  (s.ops||[]).forEach(function(op, i){
    o += d('ref','left:88px;top:'+(y-4)+'px', String(i+1));
    o += d('keytxt','left:158px;top:'+y+'px;width:'+(right-158)+'px;font-size:40px', op);
    y += Math.max(72, Math.ceil(op.length/54)*54 + 26);
  });
  if (s.draw === 'qr') o += drawQR(1080, 300);
  (s.body||[]).forEach(function(p){ o += d('keytxt','left:88px;top:'+y+'px;width:920px;font-size:34px', p); y += Math.ceil(p.length/62)*46 + 26; });
  if (s.close){
    var cy = Math.min(y + 14, 672);
    o += d('spec-h','left:88px;top:'+cy+'px;width:'+(right-88)+'px;height:var(--lw07)');
    o += d('keytxt big','left:88px;top:'+(cy+26)+'px;width:'+(right-88)+'px;font-size:36px', s.close);
  }
  return o;
}

function bodySpec(s){
  var o = head(s, 96, 138);
  var y = 138 + s.ts*0.94 + 40;
  o += d('specbox','left:88px;top:'+y+'px;width:1424px',
        '<pre>' + s.spec.join('\n') + '</pre>');
  o += d('note','left:88px;top:760px', s.close.toUpperCase());
  return o;
}

function bodyDetail(s){
  /* The only sheet type that requires a drawing. Copy is the key to the figure,
     tied to the drawing by a leader, because a reference numeral with no
     explanation is not allowed to exist. */
  var o = head(s, 96, 138);
  if (s.draw === 'stack6'){
    o += drawStack6(88, 254);
    var ky = 254;
    s.keys.forEach(function(k){
      o += d('keytxt','left:512px;top:'+(ky+2)+'px;width:1000px;font-size:32px', k);
      ky += 82;
    });
  } else if (s.draw === 'bandkey'){
    o += drawBand(88, 344, 560);
    o += d('dot','left:147px;top:'+(344+59)+'px');
    o += d('lead-v','left:150px;top:288px;height:118px');
    o += d('lead-h','left:150px;top:288px;width:567px');
    o += d('ref','left:700px;top:271px','1');
    o += d('dot','left:645px;top:'+(344+59)+'px');
    o += d('lead-h','left:648px;top:406px;width:69px');
    o += d('lead-v','left:717px;top:406px;height:96px');
    o += d('ref','left:700px;top:502px','2');
    o += d('keytxt','left:790px;top:252px;width:722px;font-size:38px', s.keys[0]);
    o += d('keytxt big','left:790px;top:452px;width:722px;font-size:40px', s.keys[1]);
  }
  return o;
}

function bodyCover(s){
  var o = d('figno','left:88px;top:96px', s.fig + ' &nbsp;&middot;&nbsp; ' + s.sub);
  o += d('figtitle','left:84px;top:136px;font-size:'+s.ts+'px', s.title);
  o += drawGA6(88, 452);
  if (s.lead) o += d('keytxt big','left:980px;top:424px;width:540px;font-size:36px', s.lead);
  if (s.opsIntro) o += d('keytxt','left:980px;top:318px;width:540px;font-size:30px', s.opsIntro);
  if (s.ops){
    var y = 406;
    s.ops.forEach(function(op,i){
      o += d('ref','left:980px;top:'+(y-2)+'px', String(i+1));
      o += d('keytxt','left:1036px;top:'+y+'px;width:480px;font-size:28px', op);
      y += Math.ceil(op.length/36)*38 + 26;
    });
  }
  return o;
}

function bodyPrint(s){
  /* the blueprint. Full apparatus, because a section break is where the full
     plate earns its place. Ground and line invert; nothing else changes. */
  var o = head(s, 96, 140);
  var lines = (s.title.match(/<br>/g)||[]).length + 1;
  var y = 140 + lines * s.ts * 0.94 + 56;
  var w = s.draw ? 780 : 1180;
  o += d('spec-h','left:88px;top:'+y+'px;width:'+(s.draw?520:520)+'px;height:var(--lw07)');
  y += 46;
  if (s.lead){ o += d('keytxt big','left:88px;top:'+y+'px;width:'+w+'px;font-size:40px', s.lead); y += Math.ceil(s.lead.length/(w/22))*54 + 30; }
  if (s.draw === 'ga6') w = 420;
  if (s.parts){
    o += d('spec-h','left:88px;top:'+y+'px;width:1180px;height:var(--lw018);opacity:.5');
    y += 18;
    s.parts.forEach(function(p,i){
      var nn = (i+1)<10 ? '0'+(i+1) : ''+(i+1);
      o += d('regkey','left:88px;top:'+(y+4)+'px;width:70px', nn);
      o += d('keytxt','left:170px;top:'+y+'px;width:880px;font-size:34px', p);
      y += 54;
      o += d('spec-h','left:88px;top:'+(y-12)+'px;width:962px;height:var(--lw018);opacity:.35');
    });
    y += 18;
  }
  (s.body||[]).forEach(function(p){ o += d('keytxt','left:88px;top:'+y+'px;width:'+w+'px;font-size:34px', p); y += Math.ceil(p.length/60)*46 + 24; });
  if (s.close) o += d('keytxt','left:88px;top:'+Math.min(y,690)+'px;width:900px;font-size:32px', s.close);
  if (s.draw === 'band') o += drawBand(972, 232, 500, true);
  if (s.draw === 'ga6') o += drawGA6(560, 430);
  return o;
}

/* ------------------------------------------------------------------ render */

function renderSlide(s){
  var cls = 'stage C' + (s.t === 'print' ? ' blue' : '');
  var apparatus = (s.t === 'print' || s.t === 'cover') ? apparatusFull(s) : apparatusQuiet(s);
  var body = '';
  if (s.t === 'cover')         body = bodyCover(s);
  else if (s.t === 'print')    body = bodyPrint(s);
  else if (s.t === 'notes')    body = bodyNotes(s);
  else if (s.t === 'schedule') body = bodySchedule(s);
  else if (s.t === 'work')     body = bodyWork(s);
  else if (s.t === 'spec')     body = bodySpec(s);
  else if (s.t === 'detail')   body = bodyDetail(s);
  return '<div class="slidebox"><div class="' + cls + '">' + apparatus + body + '</div></div>';
}

var TYPE_NOTE = {
  cover:    'COVER &middot; full apparatus &middot; drawing',
  print:    'BLUEPRINT &middot; full apparatus &middot; ground inverts',
  notes:    'NOTES SHEET &middot; quiet apparatus &middot; NO DRAWING',
  schedule: 'SCHEDULE &middot; quiet apparatus &middot; NO DRAWING',
  work:     'WORK INSTRUCTION &middot; quiet apparatus',
  spec:     'SPECIFICATION &middot; quiet apparatus &middot; NO DRAWING',
  detail:   'DETAIL &middot; quiet apparatus &middot; drawing required'
};

function buildDeck(mountId){
  var mount = document.getElementById(mountId);
  var html = '';
  SLIDES.forEach(function(s){
    html += renderSlide(s);
    html += '<p class="slidecap"><b>' + (s.n<10?'0':'') + s.n + '</b> &nbsp; ' +
            TYPE_NOTE[s.t] + (s.draw ? '' : '') + '</p>';
  });
  mount.innerHTML = html;
}
