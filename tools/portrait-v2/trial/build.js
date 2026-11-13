// 霍斯特試做的成果頁：姿勢候選（每個姿勢 2 張）＋語音對照 → trial.html
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/LOREN/Documents/_projects/MECH-CORDON';
const sharp = require(ROOT + '/node_modules/sharp');
const OUT = __dirname;
const WORK = ROOT + '/tools/comfyui/runtime/work/v2/castron';
const VL = ROOT + '/tools/voicelab/castron';
const POSES = [
  ['p1', '抱胸（現有）', ROOT + '/tools/charwork/castron/p1_cand_801320663.webp'],
  ['p2', '無線電（現有）', ROOT + '/tools/charwork/castron/p2_master_edit22.webp'],
  ['p3_q3l', '抱胸・3/4 面向左'],
  ['p4_q3r', '抱胸・3/4 面向右'],
  ['p5_slam', '拍桌前傾'],
  ['p6_point', '指人'],
  ['p7_back', '背對回頭'],
  ['p8_watch', '看錶'],
  ['p9_neck', '摸後頸（愧疚）'],
  ['p10_laugh', '叉腰大笑'],
];
const PICK = { p3_q3l: '11', p4_q3r: '22', p5_slam: '11', p7_back: '11', p8_watch: '22', p9_neck: '22', p10_laugh: '11', p6_point: '33' };
const EXPR = { neutral: '平常', scheme: '算計', angry: '生氣', guilt: '愧疚', laugh: '大笑', surprised: '驚訝' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

(async () => {
  const thumb = async (f) =>
    'data:image/webp;base64,' + (await sharp(f).resize({ height: 520 }).webp({ quality: 74 }).toBuffer()).toString('base64');
  let poseHtml = '';
  for (const [id, name, fixed] of POSES) {
    const files = fixed ? [fixed] : fs.existsSync(WORK + '/' + id) ? fs.readdirSync(WORK + '/' + id).filter((f) => f.endsWith('.png')).map((f) => WORK + '/' + id + '/' + f) : [];
    const imgs = [];
    for (const f of files) {
      const sd = fixed ? '' : path.basename(f).match(/_(\d+)/)[1];
      const pk = !fixed && PICK[id] === sd;
      imgs.push(`<figure class="${pk ? 'pick' : ''}"><img src="${await thumb(f)}" alt="${esc(name)}"><figcaption>${fixed ? '現有' : '種子 ' + sd}${pk ? ' <b>建議</b>' : ''}</figcaption></figure>`);
    }
    poseHtml += `<div class="pose"><h3><span>${id.split('_')[0]}</span>${esc(name)}</h3><div class="row">${imgs.join('') || '<p class="miss">還沒產生</p>'}</div></div>`;
  }
  let voiceHtml = '';
  if (fs.existsSync(VL + '/index.json')) {
    const idx = JSON.parse(fs.readFileSync(VL + '/index.json', 'utf8'));
    const keys = [...new Set(idx.map((r) => r.key))];
    for (const k of keys) {
      const rs = idx.filter((r) => r.key === k);
      const au = (m) =>
        rs
          .filter((r) => r.mode === m)
          .map((r) => `<audio controls preload="none" src="data:audio/mpeg;base64,${fs.readFileSync(VL + '/' + r.file).toString('base64')}"></audio>`)
          .join('');
      const r0 = rs[0];
      const st = (m) => esc(rs.find((r) => r.mode === m).style);
      voiceHtml += `<div class="line"><div class="lt"><b>${EXPR[r0.expr] || r0.expr}</b><p>${esc(r0.text)}</p></div>
        <div class="cmp"><div><span class="tag old">現在的固定語氣</span><small>${st('old')}</small>${au('old')}</div>
        <div><span class="tag new">照表情的語氣</span><small>${st('emo')}</small>${au('emo')}</div></div></div>`;
    }
  }
  const tpl = fs.readFileSync(OUT + '/tpl.html', 'utf8');
  fs.writeFileSync(OUT + '/castron-trial.html', tpl.replace('{{POSES}}', poseHtml).replace('{{VOICE}}', voiceHtml || '<p class="miss">語音還沒產生</p>'));
  console.log('ok', fs.statSync(OUT + '/castron-trial.html').size);
})();
