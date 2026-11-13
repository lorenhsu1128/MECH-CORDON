// node setb.js <角色> '<姿勢> fx fy fw fh ex ey ew eh mx my mw mh; …'：寫進 B.json
const fs=require('fs'),f=__dirname+'/B.json';const B=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};
const [c,s]=process.argv.slice(2);B[c]=B[c]||{};
for(const r of s.split(';').map(x=>x.trim()).filter(Boolean)){const [p,...n]=r.split(/\s+/);const v=n.map(Number);B[c][p]={face:v.slice(0,4),eyes:v.slice(4,8),mouth:v.slice(8,12)};}
fs.writeFileSync(f,JSON.stringify(B,null,1));
// 檢查圖用的框檔
const o={};for(const p in B[c])o[c+':'+p]=B[c][p];fs.writeFileSync(__dirname+'/v_'+c+'.jpg.boxes.json',JSON.stringify(o));
