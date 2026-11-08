// 潛入區段的探照燈塔（主線擴充 A2，docs/campaign-expansion-design.md；game/seg-ops.js 的 secLightTick／secLightVis）。
// 純函式、不呼叫亂數；舊尺度建模（1＝3 m，遊戲裡整個乘 MS），原點＝塔底的地面。
// 會動的節點：head（燈頭，繞 Y 轉）、beam（光束，加色、照到玩家時變紅）、lens（燈面＝弱點 wp，打壞就藏起來）。
// 弱點的位置與光束的長度、寬度在 data/devices.js 的 seclight，模型要對齊它們。
import { bakeAll } from './geometry.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';
import { HP, bx, cy, cz, fine, mGlow, mLamp, metalSet, railing, rod } from './dev-kit.js';
import { DEVICES } from '../data/devices.js';

const TINT = { tint: { ao: 0.85, grime: 0.45, gh: 0.6 } };

export function buildSecLight(color = 0xfff0c8) {
  const g = new THREE.Group();
  const D = DEVICES.seclight;
  const H = D.wp[1];
  const glb = providedModel('device/seclight');
  if (glb) {
    g.add(glb);
    g.head = glb.getObjectByName('head') || null;
    g.lens = glb.getObjectByName('lens') || null;
  }
  const M = metalSet(0x4a5258, { roughness: 0.55 });
  const glow = mGlow(0xff5040, 1.1);
  if (!glb) {
    const b = new THREE.Group();
    g.add(b);
    // 混凝土基礎＋四根主柱的格子塔（漸細）＋斜撐
    bx(b, M.con, 1.5, 0.3, 1.5, 0, 0.15, 0, 0, 0, 0, 0.05);
    const wAt = (y) => 0.55 - (y / H) * 0.3;
    const lv = [0.3, 1.3, 2.3, 3.3, H - 0.55];
    const C = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let i = 0; i < lv.length - 1; i++) {
      const w0 = wAt(lv[i]),
        w1 = wAt(lv[i + 1]);
      for (let k = 0; k < 4; k++) {
        const p = C[k],
          q = C[(k + 1) % 4];
        rod(b, M.body, [p[0] * w0, lv[i], p[1] * w0], [p[0] * w1, lv[i + 1], p[1] * w1], 0.06, 6);
        rod(b, M.sub, [p[0] * w0, lv[i], p[1] * w0], [q[0] * w1, lv[i + 1], q[1] * w1], 0.025, 5);
        rod(b, M.sub, [p[0] * w1, lv[i + 1], p[1] * w1], [q[0] * w1, lv[i + 1], q[1] * w1], 0.03, 5);
      }
    }
    // 頂上的平台＋欄杆＋爬梯＋警示燈
    const top = H - 0.55;
    bx(b, M.dark, 1.3, 0.1, 1.3, 0, top, 0, 0, 0, 0, 0.02);
    railing(
      b,
      M.yel,
      [
        [-0.62, -0.62],
        [0.62, -0.62],
        [0.62, 0.62],
        [-0.62, 0.62],
        [-0.62, -0.62],
      ],
      top + 0.05,
      0.32,
    );
    for (let y = 0.4; y < top; y += 0.22) rod(b, M.steel, [-0.42, y, 0.5], [-0.18, y, 0.5], 0.015, 4);
    rod(b, M.steel, [-0.42, 0.3, 0.5], [-0.42, top, 0.5], 0.02, 5);
    rod(b, M.steel, [-0.18, 0.3, 0.5], [-0.18, top, 0.5], 0.02, 5);
    cy(b, M.dark, 0.18, 0.2, 0, top + 0.15, 0, 16, 0.02);
    fine(() => {
      cy(b, glow, 0.06, 0.1, 0.55, top + 0.4, 0.55, 10, 0.01);
      cy(b, glow, 0.06, 0.1, -0.55, top + 0.4, -0.55, 10, 0.01);
      bx(b, M.dark, 0.3, 0.5, 0.2, 0.25, 0.55, -0.25, 0, 0, 0, 0.02); // 配電箱
    });
    bakeAll(b, { ...TINT, cache: 'sec_tower' });
    // 燈頭：旋轉座＋燈罩（沿 +Z）＋散熱片
    const head = new THREE.Group();
    head.position.y = H;
    g.add(head);
    const hb = new THREE.Group();
    head.add(hb);
    cy(hb, M.dark, 0.22, 0.25, 0, -0.32, 0, 18, 0.03);
    bx(hb, M.body, 0.12, 0.45, 0.25, -0.34, -0.05, 0, 0, 0, 0, 0.02);
    bx(hb, M.body, 0.12, 0.45, 0.25, 0.34, -0.05, 0, 0, 0, 0, 0.02);
    cz(hb, M.body, 0.33, 0.7, 0, 0, -0.05, 22, 0.04, 0.28);
    cz(hb, M.steel, 0.36, 0.08, 0, 0, 0.32, 24, 0.01);
    fine(() => {
      for (let i = 0; i < 5; i++) cz(hb, M.dark, 0.3, 0.03, 0, 0, -0.3 + i * 0.07, 18, 0, 0.3);
    });
    bakeAll(hb, { ...TINT, cache: 'sec_head' });
    g.head = head;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), mLamp(color, 2.2));
    lens.rotation.x = HP;
    lens.position.z = 0.36;
    head.add(lens);
    g.lens = lens;
  }
  // 光束：從燈面往 +Z 的圓錐（略往下俯，遠端碰到地面），加色、不寫深度、不投影
  if (g.head) {
    const L = D.len,
      R = Math.tan(D.ang) * L;
    const geo = new THREE.ConeGeometry(R, L, 28, 1, true);
    geo.translate(0, -L / 2, 0);
    geo.rotateX(-HP);
    const beam = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xfff0c8,
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.rotation.x = Math.atan2(H, L * 0.72); // 光束的中心線在 72% 處碰到地面
    beam.userData.helper = true;
    beam.userData.noFade = true;
    beam.userData.noAO = true;
    beam.castShadow = beam.receiveShadow = false;
    beam.renderOrder = 5;
    g.head.add(beam);
    g.beam = beam;
  }
  g.wp = g.lens;
  tagStyle(g);
  return g;
}
