/* ============================================================================
   THE HYBRID - a technical plate drawn ON the weave.
   Fouta Mark provenance: (c) Boubacar Barry - Fouta Djallon.
   Origin: house-style hybrid 2026-07-28.
   Registry: agentsHQ/docs/ip/provenance-registry.md

   FROM THE PLATE: the sheet, zone letters, figure numbers, the title block
   reading DRAWN BOUBACAR, plan and section drawings of the cloth with real
   arkilla kerka dimensions, PLAIN WEAVE and CANNYUDI as legitimate annotation,
   reference numerals on leader lines.

   FROM THE CLOTH: the ground. Six indigo strips at full bleed, each warped at
   its own stripe pitch because each strip was set up on the loom separately.
   And the discipline the plate most needed - ONE DOMINANT READING ZONE.

   THE JOIN, and it is one idea rather than two styles stapled together:
   THE HELD FIELD. Before the cloth goes in the vat the parts that must stay
   readable are bound off, and the dye never reaches them. So on every content
   sheet the message sits in a field that is HELD OUT OF THE DYE: the warp
   stripes and the vat lines stop at its edge, the ground inside it goes flat
   and quiet, registration ticks mark its corners, and the dimension chain
   running across the sheet breaks at its boundary and picks up on the far side.
   Nothing else is allowed in there. The drawing serves the field rather than
   competing with it, which is the two second test from the back of the room.

   GROUNDS. Two, one token flip apart.
     vat      indigo, warp stripes, cotton line. 24 sheets. The default.
     reserve  cream, the cloth the dye never reached at all. 9 sheets, and it
              lands on exactly the slides your deck already runs dark, so the
              rhythm of the night is unchanged. In an indigo deck the cream
              sheet is the interruption, which is the opposite of B's problem:
              the reserve is rare again, so it means something again.

   APPARATUS. Full on 11 sheets (2 covers, 9 reserves): heavy border, zone
   letters, seven cell title block. Quiet on the other 22: hairline border, no
   zone letters, one line strip at the foot. A DRAWING appears on 7 of 33.

   NO ROTATED CARDS ANYWHERE. Nothing in weaving or in drafting tilts.
   ========================================================================= */

var SLIDES = [
/* 0 */ {n:0,  t:'cover', fig:'SHEET 00 OF 33', sub:'HOLDING', time:'6:30',
        title:'AI WITHOUT<br>GETTING BURNED', ts:104,
        ops:['Get on the wifi.','Go to claude.ai and sign in, or make a free account.','Put your name on a tag so the person next to you knows who you are.'],
        opsIntro:'Grab a seat. Open your laptop. Three things before we start.',
        tb:{Scale:'1:20', Rev:'A', Zone:'ROOM 105'}},

/* 1 */ {n:1,  t:'cover', fig:'SHEET 01 OF 33', sub:'GENERAL ARRANGEMENT', time:'7:00',
        title:'AI WITHOUT<br>GETTING BURNED', ts:98, draw:'ga6',
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

/* 5 */ {n:5,  t:'res', fig:'FIG. 05', sub:'THE WAY OUT', time:'7:07',
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

/* 9 */ {n:9,  t:'res', fig:'FIG. 09', sub:'BEFORE WE BUILD', time:'7:15',
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

/* 13 */{n:13, t:'res', fig:'SECTION 02', sub:'THE MAIN EVENT', time:'7:26',
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

/* 19 */{n:19, t:'res', fig:'FIG. 19', sub:'REVISION A', time:'7:48',
        title:'ADD ONE LINE', ts:118,
        lead:'Same council. Different job. It tells you how this goes wrong before it costs you anything.',
        body:['Cheapest insurance in business.'],
        tb:{Scale:'—', Rev:'A', Zone:'A1'}},

/* 20 */{n:20, t:'res', fig:'SECTION 03', sub:'WATCH THIS PART', time:'7:50',
        title:'WHAT THIS LOOKS LIKE<br>ON A REAL BUSINESS', ts:86, draw:'band',
        lead:'I am going to point my setup at a business and show you what it finds. Public information only, and not one of yours.',
        tb:{Scale:'1:2', Rev:'1', Zone:'B2'}},

/* 21 */{n:21, t:'res', fig:'FIG. 21', sub:'ONE RACE, TEN MINUTES', time:'8:00',
        title:'ME VERSUS<br>THE MACHINE', ts:118, draw:'band',
        lead:'One task off a real to-do list. I do it by hand. The setup does it beside me. We start at the same time and you watch both.',
        tb:{Scale:'1:2', Rev:'1', Zone:'C2'}},

/* 22 */{n:22, t:'notes', fig:'FIG. 22', sub:'GENERAL NOTE', time:'8:08',
        title:'THAT GAP IS<br>THE OPPORTUNITY', ts:96,
        lead:'Which is a very convenient thing for me to say right before I make you an offer. I will get there. Stay with me.',
        body:['I built that myself, on nights and weekends, and it took a while. You do not need my version. You need the two or three pieces that pay you back first.']},

/* 23 */{n:23, t:'res', fig:'SECTION 04', sub:'TOOL TWO', time:'8:10',
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

/* 28 */{n:28, t:'res', fig:'FIG. 28', sub:'THE PART THAT OUTLIVES THE TOOLS', time:'8:19',
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

/* 32 */{n:32, t:'res', fig:'SHEET 33 OF 33', sub:'ISSUED', time:'8:28',
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

function drawStack6(x, y, mirror){        /* the cloth rotated 90 deg. Six is the real
                                     count, which is the only reason this drawing
                                     is allowed to exist on this sheet. */
  var w = 268, pitch = 78, bh = 62;
  var o = d('note','left:'+x+'px;top:'+(y-34)+'px;width:320px;line-height:1.3','PLAN &nbsp;&middot;&nbsp; SIX STRIPS, 1:20');
  for (var i=0;i<6;i++){
    var ty = y + i*pitch;
    o += d('spec-h','left:'+x+'px;top:'+ty+'px;width:'+w+'px;height:var(--lw035)');
    o += d('spec-h','left:'+x+'px;top:'+(ty+bh)+'px;width:'+w+'px;height:var(--lw035)');
    o += d('spec-v','left:'+x+'px;top:'+ty+'px;width:var(--lw07);height:'+bh+'px');
    o += d('spec-v','left:'+(x+w)+'px;top:'+ty+'px;width:var(--lw07);height:'+bh+'px');
    if (i===5) o += d('weave','left:'+x+'px;top:'+ty+'px;width:'+w+'px;height:'+bh+'px');
    else o += d('motif','left:'+(x+w/2-26)+'px;top:'+(ty+10)+'px;width:52px;height:52px;'+
                 'background:var(--indigo);opacity:'+(i%2 ? '.55' : '.9'));
    /* leader from the strip out to its numeral, on whichever side the key is */
    if (mirror){
      o += d('lead-h','left:'+(x-44)+'px;top:'+(ty+bh/2)+'px;width:44px');
      o += d('ref','left:'+(x-96)+'px;top:'+(ty+bh/2-18)+'px', String(i+1));
    } else {
      o += d('lead-h','left:'+(x+w)+'px;top:'+(ty+bh/2)+'px;width:44px');
      o += d('ref','left:'+(x+w+52)+'px;top:'+(ty+bh/2-18)+'px', String(i+1));
    }
  }
  o += d('ext','left:'+(x-8)+'px;top:'+y+'px;height:'+(5*pitch+bh)+'px;opacity:.28');
  o += d('note','left:'+x+'px;top:'+(y+5*pitch+bh+16)+'px;width:320px;line-height:1.3','6 &times; 220 = 1320');
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


/* ---------------------------------------------------------------- ground
   Six strips at full bleed. Each was warped separately, so no two share a
   stripe pitch; that is done in CSS per band rather than here. The vat lines
   are where the cloth hung over the edge of the dye bath. */
function ground(s){
  if (s.t === 'res') return '';          /* the dye never reached this sheet */
  var o = '<div class="ground" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  [188, 362, 548, 706].forEach(function(y){ o += d('vatline','top:'+y+'px'); });
  return o;
}

/* ----------------------------------------------------------- the held field
   The one dominant reading zone. Bound off before the vat, so the dye never
   reaches it: inside, the ground goes flat and every stripe and vat line
   stops. Registration ticks at the corners declare the boundary the way a
   drawing declares a detail. Nothing but the message is allowed in here. */
var FIELDS = {
  cover:    {x:58,  y:70,  w:1484, h:440},
  res:      {x:58,  y:70,  w:1000, h:566},
  resWide:  {x:58,  y:70,  w:1424, h:566},
  notes:    {x:58,  y:70,  w:1140, h:610},
  schedule: {x:58,  y:70,  w:1330, h:660},
  work:     {x:58,  y:70,  w:1330, h:660},
  spec:     {x:58,  y:70,  w:1330, h:660},
  detail:   {x:58,  y:70,  w:860,  h:706}
};
function FIELD(s){
  if (s.t === 'res') return s.draw ? FIELDS.res : FIELDS.resWide;
  if (s.t === 'work' && s.draw) return {x:58, y:70, w:900, h:660};
  return FIELDS[s.t] || FIELDS.notes;
}
function held(s){
  var f = FIELD(s), o = '';
  if (s.t !== 'res') o += d('held','left:'+f.x+'px;top:'+f.y+'px;width:'+f.w+'px;height:'+f.h+'px');
  var T = 24;
  [[f.x, f.y, 1, 1], [f.x+f.w, f.y, -1, 1], [f.x, f.y+f.h, 1, -1], [f.x+f.w, f.y+f.h, -1, -1]]
    .forEach(function(c){
      var hx = c[2] > 0 ? c[0] : c[0]-T, vy = c[3] > 0 ? c[1] : c[1]-T;
      var bot = c[3] < 0 ? ' b' : '';
      o += d('tick'+bot,'left:'+hx+'px;top:'+c[1]+'px;width:'+T+'px;height:var(--lw035)');
      o += d('tick'+bot,'left:'+c[0]+'px;top:'+vy+'px;width:var(--lw035);height:'+T+'px');
    });
  return o;
}

/* --------------------------------------------------- the cross-field chain
   Annotation reading across the whole sheet, dimensioning the strip module
   the ground is actually built from. It BREAKS at the held field and picks up
   on the far side, which is how the sheet says the field is reserved. */
function dimChainAt(y, f){
  var o = '';
  var breaks = (f.y <= y && y <= f.y + f.h) ? [f.x - 16, f.x + f.w + 16] : null;
  var segs = breaks ? [[58, breaks[0]], [breaks[1], 1542]] : [[58, 1542]];
  segs.forEach(function(sg){
    if (sg[1] - sg[0] < 30) return;
    o += d('dimline','left:'+sg[0]+'px;top:'+y+'px;width:'+(sg[1]-sg[0])+'px');
  });
  [58, 324.67, 591.33, 858, 1124.67, 1391.33].forEach(function(x){
    if (breaks && x > breaks[0] - 8 && x < breaks[1] + 8) return;
    o += d('slash','left:'+(x-1)+'px;top:'+(y-7)+'px');
    o += d('ext','left:'+x+'px;top:'+(y-30)+'px;height:26px');
  });
  var widest = segs.reduce(function(a,b){ return (b[1]-b[0]) > (a[1]-a[0]) ? b : a; }, segs[0]);
  if (widest[1] - widest[0] < 240) return '';
  o += d('dimtxt','left:'+Math.round((widest[0]+widest[1])/2 - 88)+'px;top:'+(y-11)+'px','STRIP MODULE 266');
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
  o += d('spec-h','left:88px;top:796px;width:1300px;height:var(--lw018);opacity:.5');
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

function flowTop(s){
  var lines = (s.title.match(/<br>/g)||[]).length + 1;
  return Math.round(138 + lines * s.ts * 0.94 + 40);
}

/* Content sheets lay out in real document flow inside the held field. Hand
   computed row heights were quietly wrong every time the copy changed length,
   so the browser measures instead. */
function flow(s, w, inner){
  var y = flowTop(s);
  return d('flow','left:88px;top:'+y+'px;width:'+w+'px', inner);
}

function bodyNotes(s){
  /* NO DRAWING. This is what the hybrid looks like on a sheet with nothing to
     draw, and it is the most common sheet in the set. */
  var o = head(s, 96, 138), h = '<div class="r07"></div>';
  if (s.lead) h += '<p class="lead">' + s.lead + '</p>';
  (s.body||[]).forEach(function(p){ h += '<p class="para">' + p + '</p>'; });
  return o + flow(s, 1060, h);
}

function bodySchedule(s){
  /* NO DRAWING. A parts schedule is already a drawing office document. */
  var o = head(s, 96, 138), h = '';
  if (s.lead) h += '<p class="lead">' + s.lead + '</p>';

  if (s.twin){
    h += '<div class="twin">' + s.twin.map(function(col){
      return '<div><p class="colh' + (col.no ? ' no' : '') + '">' + col.h + '</p>' +
             '<div class="r07"></div>' +
             col.rows.map(function(r){ return '<p class="trow">' + r + '</p>'; }).join('') +
             '</div>';
    }).join('') + '</div>';
  }
  if (s.reg){
    h += '<div class="sched">' + s.reg.map(function(r){
      return '<div class="row"><b style="width:' + (s.regw ? 380 : 110) + 'px">' + r[0] + '</b><span>' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }
  if (s.parts){
    var two = s.parts.length > 6;
    var per = two ? Math.ceil(s.parts.length/2) : s.parts.length;
    var cols = two ? [s.parts.slice(0, per), s.parts.slice(per)] : [s.parts];
    h += '<div class="' + (two ? 'twin' : '') + '">' + cols.map(function(c, ci){
      return '<div class="sched">' + c.map(function(pt, i){
        var n = ci*per + i + 1;
        return '<div class="row"><b style="width:64px">' + (n<10?'0':'') + n + '</b><span>' + pt + '</span></div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }
  if (s.close) h += '<p class="close">' + s.close + '</p>';
  return o + flow(s, 1300, h);
}

function bodyWork(s){
  /* Operations get the oxide numeral, the same reference numeral the drawings
     use. NO DRAWING unless the sheet names one. */
  var o = head(s, 96, 138), h = '';
  if (s.opsIntro) h += '<p class="para">' + s.opsIntro + '</p>';
  if (s.lead) h += '<p class="lead">' + s.lead + '</p>';
  (s.ops||[]).forEach(function(op, i){
    h += '<div class="op"><i>' + (i+1) + '</i><span>' + op + '</span></div>';
  });
  (s.body||[]).forEach(function(p){ h += '<p class="para">' + p + '</p>'; });
  if (s.close) h += '<div class="r07"></div><p class="close">' + s.close + '</p>';
  return o + flow(s, s.draw ? 860 : 1300, h) + (s.draw === 'qr' ? drawQR(1060, 300) : '');
}

function bodySpec(s){
  var o = head(s, 96, 138);
  return o + flow(s, 1300,
    '<div class="specbox"><pre>' + s.spec.join('\n') + '</pre></div>' +
    '<p class="notefoot">' + s.close.toUpperCase() + '</p>');
}

function bodyDetail(s){
  /* The only sheet type that requires a drawing. Copy is the key to the figure,
     tied to the drawing by a leader, because a reference numeral with no
     explanation is not allowed to exist. */
  var o = head(s, 96, 138);
  if (s.draw === 'stack6'){
    o += drawStack6(1200, 268, true);
    var ky = 250;
    s.keys.forEach(function(k){
      o += d('keytxt','left:88px;top:'+(ky+2)+'px;width:940px;font-size:31px', k);
      ky += 84;
    });
  } else if (s.draw === 'bandkey'){
    o += drawBand(1012, 316, 500, true);
    /* callouts: dot on the cloth, elbowed leader out to a numeral that sits
       between the drawing and the key. No leader ever crosses another. */
    o += d('dot','left:1039px;top:'+(316+59)+'px');
    o += d('lead-h','left:952px;top:378px;width:90px');
    o += d('lead-v','left:952px;top:302px;height:78px');
    o += d('ref','left:934px;top:266px','1');
    o += d('dot','left:1470px;top:'+(316+59)+'px');
    o += d('lead-v','left:1473px;top:378px;height:150px');
    o += d('lead-h','left:952px;top:526px;width:523px');
    o += d('ref','left:934px;top:508px','2');
    o += d('keytxt','left:88px;top:248px;width:800px;font-size:38px', s.keys[0]);
    o += d('keytxt big','left:88px;top:490px;width:800px;font-size:40px', s.keys[1]);
  }
  return o;
}

function bodyCover(s){
  var o = d('figno','left:88px;top:96px', s.fig + ' &nbsp;&middot;&nbsp; ' + s.sub);
  o += d('figtitle','left:84px;top:136px;font-size:'+s.ts+'px', s.title);
  if (s.draw === 'ga6') o += drawGA6(88, 520);
  if (s.lead) o += d('keytxt big','left:920px;top:276px;width:620px;font-size:33px', s.lead);
  if (s.opsIntro) o += d('keytxt','left:900px;top:150px;width:620px;font-size:32px', s.opsIntro);
  if (s.ops){
    var y = 250;
    s.ops.forEach(function(op,i){
      o += d('ref','left:900px;top:'+(y-2)+'px', String(i+1));
      o += d('keytxt','left:956px;top:'+y+'px;width:566px;font-size:30px', op);
      y += Math.ceil(op.length/42)*42 + 28;
    });
  }
  return o;
}

function bodyRes(s){
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
  if (s.draw === 'band') o += drawBand(1092, 240, 420, true);
  if (s.draw === 'ga6') o += drawGA6(560, 430);
  return o;
}

/* ------------------------------------------------------------------ render */

function renderSlide(s){
  var cls = 'stage H' + (s.t === 'res' ? ' res' : '');
  var apparatus = (s.t === 'res' || s.t === 'cover') ? apparatusFull(s) : apparatusQuiet(s);
  var body = '';
  if (s.t === 'cover')         body = bodyCover(s);
  else if (s.t === 'res')      body = bodyRes(s);
  else if (s.t === 'notes')    body = bodyNotes(s);
  else if (s.t === 'schedule') body = bodySchedule(s);
  else if (s.t === 'work')     body = bodyWork(s);
  else if (s.t === 'spec')     body = bodySpec(s);
  else if (s.t === 'detail')   body = bodyDetail(s);
  return '<div class="slidebox"><div class="' + cls + '">' +
         ground(s) + apparatus + held(s) + body + '</div></div>';
}

var TYPE_NOTE = {
  cover:    'VAT &middot; COVER &middot; full apparatus &middot; drawing',
  res:      'RESERVE &middot; full apparatus &middot; the dye never reached this sheet',
  notes:    'VAT &middot; NOTES SHEET &middot; held field &middot; NO DRAWING',
  schedule: 'VAT &middot; SCHEDULE &middot; held field &middot; NO DRAWING',
  work:     'VAT &middot; WORK INSTRUCTION &middot; held field',
  spec:     'VAT &middot; SPECIFICATION &middot; held field &middot; NO DRAWING',
  detail:   'VAT &middot; DETAIL &middot; held field &middot; drawing required'
};

/* Measure, then place. The held field is sized to the message the browser
   actually laid out, and the cross field chain only appears where there is
   real room for it below the field. */
function relayout(){
  document.querySelectorAll('#deckmount .stage').forEach(function(st, i){
    var sl = SLIDES[i], held = st.querySelector('.held'), fl = st.querySelector('.flow');
    var f = FIELD(sl);
    var old = st.querySelector('.chain'); if (old) old.remove();
    var bottom = f.y + f.h;
    if (fl && held){
      var sr = st.getBoundingClientRect();
      var k = st.getBoundingClientRect().width / 1600 || 1;
      fl.style.transform = 'none';
      var top = fl.getBoundingClientRect().top;
      var h = fl.getBoundingClientRect().height / k;
      var room = 726 - (Math.round((top - sr.top) / k));
      /* auto fit. If a sheet's copy genuinely will not sit in the field at full
         size it is scaled down, never allowed to run past the field edge, and
         never below 0.9 so the smallest line stays readable from the back. */
      var fit = h > room ? Math.max(0.90, room / h) : 1;
      fl.style.transformOrigin = 'top left';
      fl.style.transform = fit < 1 ? 'scale(' + fit.toFixed(4) + ')' : 'none';
      bottom = Math.min(726, Math.round((top - sr.top) / k + h * fit) + 26);
      held.style.height = (bottom - f.y) + 'px';
      st.querySelectorAll('.tick.b').forEach(function(t){
        t.style.top = (t.style.width === '24px' ? bottom : bottom - 24) + 'px';
      });
    }
    if (sl.t === 'res' || sl.t === 'cover' || sl.draw) return;
    var y = bottom + 30;
    if (y > 776) return;
    var wrapEl = document.createElement('div');
    wrapEl.className = 'chain';
    wrapEl.innerHTML = dimChainAt(y, {x:f.x, y:f.y, w:f.w, h:bottom - f.y});
    st.appendChild(wrapEl);
  });
}

function buildDeck(mountId){
  var mount = document.getElementById(mountId);
  var html = '';
  SLIDES.forEach(function(s){
    html += renderSlide(s);
    html += '<p class="slidecap"><b>' + (s.n<10?'0':'') + s.n + '</b> &nbsp; ' +
            TYPE_NOTE[s.t] + (s.draw ? '' : '') + '</p>';
  });
  mount.innerHTML = html;
  relayout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
}
