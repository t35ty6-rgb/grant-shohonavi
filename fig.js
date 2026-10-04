/* からだの図（Lune風の線画イラストをSVGで描く） */
const FIG=(()=>{
const C={skin:"#F4DCC8",line:"#3B2F2C",suit:"#D9788F",suitD:"#B9566F",hair:"#5A3A2E",guide:"#E2477A",ok:"#2F9E6E",ng:"#E2477A",paper:"#FFF8F5",mute:"#9B8F8A"};
const NF=[["nf",107,62],["th",110,84],["cl",114,92],["uc",120,100],["bu",127,108],["br",132,116],["bl",130,124],["ub",122,131],["rb",117,143],["wf",114,158],["bt",116,173],["be",119,189],["lb",118,204],["pu",116,218],["tt",119,232],["tf",119,252],["ak",114,285],["kn",113,302],["sh",112,325],["s2",109,355],["an",106,382]];
const NB=[["na",93,60],["nb",90,80],["ubk",86,94],["bla",84,112],["mb",86,132],["wb",90,156],["lu",88,172],["btp",83,187],["brd",76,200],["bpk",73,212],["blw",76,224],["gf",84,238],["tb",88,256],["akb",92,290],["knb",95,305],["ca",91,330],["c2",93,355],["ac",96,378],["he",95,392]];
const V={ideal:{},
 sway:{d:{be:[10,0],lb:[9,0],bt:[6,0],pu:[5,0],rb:[2,0],wf:[3,0],wb:[8,0],lu:[9,0],btp:[-2,0],brd:[-6,-2],bpk:[-6,-3],blw:[-2,-1],nf:[-4,0],th:[-4,0],cl:[-4,0],uc:[-4,0],bu:[-3,0],br:[-3,0],bl:[-3,0],na:[-5,0],nb:[-5,0],ubk:[-5,0],bla:[-4,0]},head:[-6,0],arm:[-4,0]},
 hunch:{d:{na:[8,5],nb:[7,4],ubk:[-6,2],bla:[-9,0],mb:[-4,0],nf:[8,5],th:[7,4],cl:[4,3],uc:[-2,3],bu:[-2,5],br:[-3,7],bl:[-3,8],ub:[-3,6]},head:[12,6],arm:[7,4]},
 sag:{d:{bu:[-1,8],br:[-4,16],bl:[-6,18],ub:[-6,16],rb:[-3,6],bla:[-5,2],mb:[-8,0],wb:[-2,0],btp:[3,8],brd:[3,16],bpk:[3,18],blw:[2,18],gf:[1,14],be:[4,0],lb:[3,0]}}
};
function pts(k){const v=V[k]||{},d=v.d||{},mv=([n,x,y])=>{const o=d[n]||[0,0];return [x+o[0],y+o[1]]};
 const h=v.head||[0,0],ar=v.arm||[0,0];
 return {f:NF.map(mv),b:NB.map(mv),head:[100+h[0],45+h[1]],arm:[[97+ar[0],94+ar[1]],[97+ar[0],150+ar[1]],[101+ar[0],196+ar[1]]]}}
function cr(P,closed){let d="";const n=P.length;const g=i=>closed?P[(i+n)%n]:P[Math.max(0,Math.min(n-1,i))];
 d+=`M${P[0][0]},${P[0][1]}`;for(let i=0;i<(closed?n:n-1);i++){const p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2);
 const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];
 d+=`C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`}return d+(closed?"Z":"")}
let uid=0;
function person(k,ox=0){const p=pts(k),id="c"+(uid++);
 const an=p.f[p.f.length-1],he=p.b[p.b.length-1];
 const outline=[...p.f,[an[0]+10,389],[126,394],[127,400],[112,402],[97,402],[he[0]-2,398],...p.b.slice().reverse()];
 const body=cr(outline,true);const [hx,hy]=p.head;
 const [s0,e0,w0]=p.arm;const arm=`M${s0[0]},${s0[1]} Q${e0[0]-3},${e0[1]-20} ${e0[0]},${e0[1]} T${w0[0]},${w0[1]}`;
 return `<g transform="translate(${ox},0)">
 <clipPath id="${id}"><path d="${body}"/></clipPath>
 <path d="${body}" fill="${C.skin}"/>
 <g clip-path="url(#${id})"><path d="M0,88 L200,88 L200,232 Q150,242 122,236 Q100,246 70,240 L0,244 Z" fill="${C.suit}"/></g>
 <path d="${body}" fill="none" stroke="${C.line}" stroke-width="2" stroke-linejoin="round"/>
 <circle cx="${hx}" cy="${hy}" r="22" fill="${C.skin}" stroke="${C.line}" stroke-width="2"/>
 <path d="M${hx-22},${hy+4} C${hx-25},${hy-22} ${hx+4},${hy-32} ${hx+19},${hy-11} C${hx+7},${hy-14} ${hx-1},${hy-10} ${hx-5},${hy+2} C${hx-7},${hy+18} ${hx-14},${hy+28} ${hx-20},${hy+36} C${hx-28},${hy+22} ${hx-27},${hy+12} ${hx-22},${hy+4}Z" fill="${C.hair}" stroke="${C.line}" stroke-width="1.8"/>
 <circle cx="${hx+12}" cy="${hy+1}" r="1.7" fill="${C.line}"/><path d="M${hx+13},${hy+11} q3,1.5 5,0" stroke="${C.line}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
 <path d="${arm}" stroke="${C.line}" stroke-width="15" fill="none" stroke-linecap="round"/><path d="${arm}" stroke="${C.skin}" stroke-width="11" fill="none" stroke-linecap="round"/>
 <ellipse cx="${w0[0]+1}" cy="${w0[1]+9}" rx="6.5" ry="10" fill="${C.skin}" stroke="${C.line}" stroke-width="1.8"/>
 </g>`}
const mk=()=>`<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="${C.ok}"/></marker><marker id="a2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="${C.ng}"/></marker><marker id="a3" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="#E8833A"/></marker><marker id="a4" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="${C.line}"/></marker></defs>`;
const svg=(w,inner)=>`<svg viewBox="0 0 ${w} 440" role="img" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">${mk()}<rect width="${w}" height="440" rx="18" fill="${C.paper}"/>${inner}</svg>`;
const T=(x,y,t,c=C.line,s=11,a="middle",w=700)=>`<text x="${x}" y="${y}" font-size="${s}" font-weight="${w}" fill="${c}" text-anchor="${a}" font-family="Zen Kaku Gothic New,sans-serif">${t}</text>`;
function plumb(x,c){return `<line x1="${x}" y1="14" x2="${x}" y2="404" stroke="${c}" stroke-width="1.6" stroke-dasharray="5 5"/>`}
function balance(){const ys=[67,116,158,210];const lab=["あご","バストトップ","ウエスト","ヒップトップ"];
 let g=person("ideal",40);
 ys.forEach((y,i)=>{g+=`<line x1="52" y1="${y}" x2="252" y2="${y}" stroke="${C.guide}" stroke-width="1.4" stroke-dasharray="4 4"/>`+T(258,y+4,lab[i],C.line,11,"start")});
 for(let i=0;i<3;i++){const y1=ys[i]+3,y2=ys[i+1]-3;g+=`<line x1="56" y1="${y1}" x2="56" y2="${y2}" stroke="${C.guide}" stroke-width="2"/>`+T(50,(y1+y2)/2+4,"顔1つ分",C.guide,10,"end")}
 g+=`<path d="M176,116 h20" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/><path d="M110,212 h-20" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/>`;
 g+=T(196,262,"バスト：ヒップ",C.ok,11,"start")+T(196,284,"＝ 1 : 1",C.ok,16,"start",900);
 g+=T(196,314,"顔4つ分で体の半分",C.mute,10,"start",500)+T(196,328,"→ 全身で8頭身",C.mute,10,"start",500);
 return svg(340,g)}
function compare(){let g="";const L=[["ideal","理想",C.ok],["hunch","猫背・巻き肩",C.ng],["sway","反り腰",C.ng]];
 L.forEach(([k,t,c],i)=>{const ox=i*190;g+=person(k,ox)+`<g opacity=".8">${plumb(ox+100,c)}</g>`+T(ox+100,428,t,c,13)});
 g+=T(285,14,"点線＝耳・肩・骨盤・くるぶしを結ぶ線（理想は一直線）",C.mute,10,"middle",500);
 return svg(570,g)}
function sag(){let g=person("ideal",10)+person("sag",210);
 g+=T(110,428,"お尻を支えると",C.ok,13)+T(310,428,"お尻が下がると",C.ng,13);
 g+=`<path d="M70,250 q42,24 86,0" stroke="${C.ok}" stroke-width="3.5" fill="none"/>`+T(112,290,"ガードルで持ち上げる",C.ok,10.5);
 g+=`<path d="M278,214 v28" stroke="${C.ng}" stroke-width="3" marker-end="url(#a2)"/>`+T(270,268,"お尻が下がる",C.ng,11,"end");
 g+=`<path d="M352,112 v24" stroke="${C.ng}" stroke-width="3" marker-end="url(#a2)"/>`+T(360,124,"バストが",C.ng,11,"start")+T(360,138,"引っぱられる",C.ng,11,"start");
 g+=`<path d="M282,112 h-24" stroke="${C.ng}" stroke-width="3" marker-end="url(#a2)"/>`+T(254,98,"お肉が背中へ",C.ng,11,"end");
 return svg(440,g)}
function footprint(x,y,good,sc=1,dots=true){const S=v=>v*sc;
 const inner=good?`C${x-S(26)},${y-S(8)} ${x-S(6)},${y-S(2)} ${x-S(6)},${y+S(14)} C${x-S(6)},${y+S(28)} ${x-S(18)},${y+S(30)} ${x-S(17)},${y+S(44)}`:`C${x-S(28)},${y-S(6)} ${x-S(26)},${y+S(14)} ${x-S(22)},${y+S(26)} C${x-S(20)},${y+S(34)} ${x-S(18)},${y+S(38)} ${x-S(17)},${y+S(44)}`;
 let g=`<path d="M${x-S(20)},${y-S(30)} ${inner} C${x-S(16)},${y+S(58)} ${x+S(14)},${y+S(60)} ${x+S(16)},${y+S(44)} C${x+S(20)},${y+S(20)} ${x+S(24)},${y-S(10)} ${x+S(22)},${y-S(30)} C${x+S(18)},${y-S(44)} ${x-S(16)},${y-S(46)} ${x-S(20)},${y-S(30)}Z" fill="${good?C.skin:"#F7D3C6"}" stroke="${C.line}" stroke-width="1.8"/>`;
 [[-15,-52,7],[-3,-56,5],[6,-55,4.5],[14,-51,4],[20,-45,3.6]].forEach(([dx,dy,r])=>g+=`<circle cx="${x+S(dx)}" cy="${y+S(dy)}" r="${S(r)}" fill="${C.skin}" stroke="${C.line}" stroke-width="1.5"/>`);
 if(dots){const P3=[[x,y+S(44)],[x-S(14),y-S(28)],[x+S(16),y-S(22)]],c=good?C.ok:C.ng;
  g+=`<path d="M${P3[0]}L${P3[1]}L${P3[2]}Z" fill="none" stroke="${c}" stroke-width="${good?2:1.6}" ${good?"":'stroke-dasharray="4 4"'}/>`;
  P3.forEach(p=>g+=`<circle cx="${p[0]}" cy="${p[1]}" r="${S(4.5)}" fill="${c}"/>`)}
 return g}
function skel(cx,good){const c=good?C.ok:C.ng;let g="";
 const sh=good?[0,0]:[-9,7],kn=good?[0,0]:[9,-9],pel=good?0:9,hd=good?0:8;
 g+=`<circle cx="${cx+hd}" cy="52" r="18" fill="${C.skin}" stroke="${C.line}" stroke-width="2"/>`;
 g+=`<path d="M${cx+hd*.6},72 ${good?`L${cx},188`:`C${cx+14},110 ${cx-14},150 ${cx},188`}" stroke="${C.line}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
 g+=`<path d="M${cx-42},${94+sh[0]} L${cx+42},${94+sh[1]}" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/>`;
 g+=`<ellipse cx="${cx}" cy="200" rx="34" ry="13" transform="rotate(${pel} ${cx} 200)" fill="${good?"#E6F4ED":"#FDE7EE"}" stroke="${C.line}" stroke-width="2.2"/>`;
 const hipL=[cx-20,206+(good?0:-4)],hipR=[cx+20,206+(good?0:4)],knL=[cx-20+kn[0],290],knR=[cx+20+kn[1],290],anL=[cx-22,366],anR=[cx+22,366];
 g+=`<path d="M${hipL}L${knL}L${anL}M${hipR}L${knR}L${anR}" stroke="${C.line}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
 [hipL,hipR,knL,knR,anL,anR].forEach(p=>g+=`<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#fff" stroke="${C.line}" stroke-width="2"/>`);
 if(!good){g+=`<path d="M${cx-56},86 l14,-6 M${cx+56},101 l-14,6" stroke="${c}" stroke-width="2.5"/>`;}
 g+=`<line x1="${cx}" y1="28" x2="${cx}" y2="372" stroke="${c}" stroke-width="1.4" stroke-dasharray="4 5" opacity=".7"/>`;
 return g}
function stack(){let g="";
 g+=T(110,22,"アーチで3点に立てている",C.ok,12.5)+T(330,22,"アーチがなく足元が不安定",C.ng,12.5);
 g+=`<g transform="translate(16.5,26) scale(.85)">${skel(110,true)}</g><g transform="translate(49.5,26) scale(.85)">${skel(330,false)}</g>`;
 g+=footprint(90,380,true,.5)+footprint(130,380,true,.5,false)+footprint(310,380,false,.5)+footprint(350,380,false,.5,false);
 g+=T(110,432,"ひざ・骨盤・肩がまっすぐ積み上がる",C.ok,10,"middle",700)+T(330,432,"ひざが内に入り、骨盤・肩が傾く",C.ng,10,"middle",700);
 return svg(440,g)}
function arches(){let g="";
 g+=T(110,24,"アーチがある足",C.ok,13)+T(330,24,"アーチがない足（偏平足）",C.ng,13);
 g+=footprint(110,150,true,1.9)+footprint(330,150,false,1.9);
 g+=T(110,52,"",C.mute);
 g+=T(40,214,"内側の",C.ok,10,"middle")+T(40,227,"縦アーチ",C.ok,10,"middle")+T(178,190,"外側の",C.ok,10,"middle")+T(178,203,"縦アーチ",C.ok,10,"middle")+T(110,132,"横アーチ",C.ok,10,"middle");
 g+=T(110,268,"かかと・親指の付け根・小指の付け根の",C.line,10.5,"middle",500)+T(110,282,"3点で体を支える",C.line,10.5);
 g+=T(330,268,"土踏まずがつぶれて足裏全体がべったり",C.line,10.5,"middle",500)+T(330,282,"3点で支えられず、足首が内に倒れる",C.line,10.5,"middle",500);
 // side views
 const side=(x,good)=>{const c=good?C.ok:C.ng;return `<path d="M${x-70},392 C${x-74},368 ${x-58},352 ${x-40},350 C${x-20},346 ${x},340 ${x+18},350 C${x+40},360 ${x+66},372 ${x+74},386 C${x+76},392 ${x+70},394 ${x+60},394 ${good?`C${x+30},394 ${x+20},378 ${x-10},376 C${x-36},374 ${x-46},392 ${x-60},394`:`L${x-60},394`} C${x-66},394 ${x-70},394 ${x-70},392Z" fill="${C.skin}" stroke="${C.line}" stroke-width="2"/><line x1="${x-90}" y1="395" x2="${x+90}" y2="395" stroke="${C.mute}" stroke-width="1.5"/>`+(good?`<path d="M${x-44},388 Q${x+5},360 ${x+56},390" stroke="${c}" stroke-width="2.5" fill="none" stroke-dasharray="5 4"/>`+T(x,420,"アーチがバネになる",c,10.5):T(x,420,"足裏が床にべったり",c,10.5))};
 g+=side(110,true)+side(330,false);
 g+=T(110,318,"横から見ると",C.mute,10,"middle",500)+T(330,318,"横から見ると",C.mute,10,"middle",500);
 return svg(440,g)}
/* 素材のしくみ */
function kodenshi(){let g="";const col=(x,ko)=>{let s="";
  s+=`<rect x="${x-90}" y="300" width="180" height="56" rx="10" fill="${C.skin}" stroke="${C.line}" stroke-width="2"/>`+T(x,333,"からだ（体温）",C.line,12);
  s+=`<rect x="${x-90}" y="150" width="180" height="50" rx="10" fill="${ko?C.suit:"#E7E2E0"}" stroke="${C.line}" stroke-width="2"/>`;
  if(ko)for(let i=0;i<14;i++)s+=`<circle cx="${x-80+i*12.3}" cy="${i%2?192:158}" r="3" fill="#fff" stroke="${C.line}" stroke-width="1"/>`;
  s+=T(x,180,ko?"光電子の生地":"ふつうの生地",ko?"#fff":C.mute,12.5);
  for(let i=-1;i<=1;i++){const ax=x+i*50;s+=`<path d="M${ax},296 q-6,-12 0,-24 q6,-12 0,-24 q-6,-12 0,-24 q6,-10 0,-16" stroke="#E8833A" stroke-width="2.4" fill="none" marker-end="url(#a3)"/>`}
  if(ko){for(let i=-1;i<=1;i++){const ax=x+i*50+20;s+=`<path d="M${ax},206 q6,12 0,24 q-6,12 0,24 q6,12 0,24 q-6,8 0,14" stroke="${C.ng}" stroke-width="2.4" fill="none" marker-end="url(#a2)"/>`}
   s+=T(x,384,"熱を受けとめて、体へ返す",C.ng,12)+T(x,402,"着ているだけで温かさが続く",C.line,10.5,"middle",500)}
  else{for(let i=-1;i<=1;i++){const ax=x+i*50;s+=`<path d="M${ax},144 q-6,-14 0,-28 q6,-14 0,-26" stroke="#E8833A" stroke-width="2.4" fill="none" opacity=".6" marker-end="url(#a3)"/>`}
   s+=T(x,384,"熱が外へ逃げていく",C.mute,12)}
  return s};
 g+=col(110,false)+col(330,true);
 g+=T(220,32,"体から出る熱（遠赤外線）のゆくえ",C.line,13)+T(220,52,"光電子＝セラミックを練り込んだ繊維",C.mute,10.5,"middle",500);
  g+=T(36,430,"",C.mute)+`<path d="M150,425 h18" stroke="#E8833A" stroke-width="2.4"/>`+T(172,429,"体から出る熱",C.line,10,"start",500)+`<path d="M256,425 h18" stroke="${C.ng}" stroke-width="2.4"/>`+T(278,429,"体へ返る熱",C.line,10,"start",500);
 return svg(440,g)}
function hormesis(){let g="<g transform=\"translate(0,-90)\">";
 g+=`<path d="M30,300 Q60,262 120,264 Q178,262 200,300 Z" fill="#CFE3EC" stroke="${C.line}" stroke-width="2"/>`;
 g+=`<path d="M70,286 q14,-30 40,-28 q26,-6 34,26 Z" fill="#8C8A84" stroke="${C.line}" stroke-width="2"/>`+T(108,282,"北投石",C.surface||"#fff",11);
 for(let i=0;i<3;i++)g+=`<path d="M${80+i*28},250 q-8,-14 0,-28 q8,-14 0,-28" stroke="${C.mute}" stroke-width="2" fill="none" opacity=".6"/>`;
 g+=T(115,326,"ラジウム温泉の鉱石",C.line,11.5)+T(115,342,"（玉川温泉などで知られる）",C.mute,10,"middle",500);
 g+=`<path d="M210,250 h34" stroke="${C.line}" stroke-width="3" marker-end="url(#a4)"/>`;
 // fabric swatch
 g+=`<rect x="262" y="190" width="150" height="120" rx="12" fill="#3A3540" stroke="${C.line}" stroke-width="2"/>`;
 for(let r=0;r<4;r++)for(let c=0;c<5;c++)g+=`<path d="M${276+c*28},${206+r*28} l8,-6 l8,6 l-8,6z" fill="#7FA8D9" opacity=".9"/>`;
 g+=T(337,330,"鉱石を生地にプリント",C.blue||"#2f5bd3",11.5)+T(337,346,"（Emm∀ Pump は柄の部分）",C.mute,10,"middle",500);
 g+="</g>"+T(220,36,"ホルミシス素材ができるまで",C.line,13);
 g+=T(220,320,"使われている商品：ホルミー（Re.B5）・Emm∀ Pump",C.line,10.5,"middle",500);
 g+=T(220,340,"お客様へは「ラジウム温泉の鉱石を使った生地です」まで",C.mute,10,"middle",500);
 return svg(440,g)}
function magnet(){let g="";
 const x=150;g+=`<path d="M${x-50},90 C${x-70},120 ${x-58},170 ${x-48},200 C${x-58},240 ${x-62},280 ${x-50},320 L${x+50},320 C${x+62},280 ${x+58},240 ${x+48},200 C${x+58},170 ${x+70},120 ${x+50},90 C${x+30},80 ${x-30},80 ${x-50},90Z" fill="${C.suit}" stroke="${C.line}" stroke-width="2"/>`;
 g+=`<circle cx="${x}" cy="60" r="24" fill="${C.hair}" stroke="${C.line}" stroke-width="2"/><line x1="${x}" y1="96" x2="${x}" y2="300" stroke="${C.suitD}" stroke-width="2" stroke-dasharray="3 4"/>`;
 [[-22,150],[22,150],[-22,205],[22,205],[-22,260],[22,260]].forEach(([dx,y])=>{g+=`<circle cx="${x+dx}" cy="${y}" r="15" fill="none" stroke="${C.ok}" stroke-width="1.2" opacity=".6"/><circle cx="${x+dx}" cy="${y}" r="24" fill="none" stroke="${C.ok}" stroke-width="1" opacity=".35"/><circle cx="${x+dx}" cy="${y}" r="7" fill="#9AA3AA" stroke="${C.line}" stroke-width="1.6"/>`});
 g+=T(x,350,"背中から腰に磁石6個",C.line,12)+T(x,366,"（スムースボディ・レーシーボディ）",C.mute,10,"middle",500)+T(x,30,"後ろから見たところ",C.mute,10,"middle",500);
 g+=`<circle cx="300" cy="140" r="7" fill="#9AA3AA" stroke="${C.line}" stroke-width="1.6"/>`+T(314,144,"＝ ネオジム磁石",C.line,11,"start");
 g+=`<circle cx="300" cy="170" r="16" fill="none" stroke="${C.ok}" stroke-width="1.2" opacity=".6"/>`+T(324,174,"＝ 磁気がとどく範囲",C.line,11,"start");
 g+=T(286,214,"ブラ：ホックの両サイド",C.line,10.5,"start",500)+T(286,232,"ガードル：腰の位置",C.line,10.5,"start",500);
 g+=`<rect x="276" y="262" width="156" height="72" rx="12" fill="${C.ok}" opacity=".12"/>`+T(354,286,"管理医療機器",C.ok,12)+T(354,304,"装着部位のこりをほぐし",C.line,10.5,"middle",500)+T(354,320,"血行を改善",C.line,10.5,"middle",500);
 return svg(440,g)}
function cutting(){let g="";const L=[["Fantasy","お腹と背中を",0],["Gracy","高さをそろえる",190],["Fairy","バストとヒップを1:1",380]];
 L.forEach(([n,t,ox])=>{g+=person("ideal",ox);g+=T(ox+100,428,n,C.ng,13)+T(ox+100,412,t,C.line,10.5,"middle",500)});
 // Fantasy zones
 g+=`<path d="M128,160 C140,180 140,214 128,228" stroke="${C.ok}" stroke-width="10" opacity=".35" fill="none" stroke-linecap="round"/><path d="M78,100 C70,130 74,160 84,172" stroke="${C.ok}" stroke-width="10" opacity=".35" fill="none" stroke-linecap="round"/>`;
 g+=`<path d="M156,196 h-18" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/><path d="M52,134 h18" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/>`+T(160,200,"前ばり",C.ok,10,"start")+T(48,124,"背中",C.ok,10,"end");
 // Gracy: guides + up arrows
 [116,158,210].forEach(y=>g+=`<line x1="250" y1="${y}" x2="340" y2="${y}" stroke="${C.guide}" stroke-width="1.2" stroke-dasharray="4 4"/>`);
 g+=`<path d="M346,136 v-16" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/><path d="M252,232 v-16" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/>`;
 // Fairy: equal arrows
 g+=`<path d="M536,136 v-18" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/><path d="M448,236 v-18" stroke="${C.ok}" stroke-width="3" marker-end="url(#a)"/>`+T(560,124,"1",C.ok,14,"middle",900)+T(436,226,"1",C.ok,14,"middle",900);
 return svg(570,g)}
const defs=`<svg width="0" height="0" style="position:absolute"><defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="${C.ok}"/></marker><marker id="a2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="${C.ng}"/></marker></defs></svg>`;
return {balance,compare,sag,stack,arches,kodenshi,hormesis,magnet,cutting,defs};
})();
