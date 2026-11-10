// 地面的標示物件（遊戲與模型庫的「地面標示」頁 library/ground.js 共用；純函式、不加進場景）：
// 地雷（game/support.js 的 layMine）與出口／補給台／資料終端／區段的光環（game/campaign.js 的 campRing）。
import { MS } from '../core/scale.js';
import { warnDiscMat } from '../fx/energy.js';

export const MINE_TRIG = 2.2 * MS; // 地雷觸發的水平距離
export const AIR_TRIG = 3 * MS; // 空中地雷的觸發距離（3D）

// 地雷的網格（air＝空中地雷；rich＝砲火特效「華麗」時感應圈是掃描圈）
export function buildMineMesh(p, air, rich) {
  const grp = new THREE.Group();
  if (air) {
    // 空中地雷：懸浮的發光球＋外圈
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, blending: THREE.AdditiveBlending }),
    );
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.6, 0),
      new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, metalness: 0.6, wireframe: true }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(AIR_TRIG / MS, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff3020,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    grp.add(core, shell, halo);
    grp.position.copy(p);
    grp.scale.setScalar(MS);
    grp.userData.light = core;
    grp.userData.halo = halo;
    return grp;
  }
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a3e38, roughness: 0.7, metalness: 0.4 }),
  );
  body.position.y = 0.11;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, blending: THREE.AdditiveBlending }),
  );
  light.position.y = 0.26;
  // 感應圈：華麗時是掃描圈（fx/energy.js 的 warnDiscMat，第 9.4 期）
  const halo = rich
    ? new THREE.Mesh(new THREE.CircleGeometry(MINE_TRIG / MS, 40), warnDiscMat(0xff3020, 1))
    : new THREE.Mesh(
        new THREE.RingGeometry(MINE_TRIG / MS - 0.1, MINE_TRIG / MS, 28),
        new THREE.MeshBasicMaterial({
          color: 0xff3020,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  grp.add(body, light, halo);
  grp.position.copy(p);
  grp.scale.setScalar(MS);
  grp.userData.light = light;
  grp.userData.halo = halo;
  return grp;
}

// 地雷的閃燈與感應圈（每格；t＝放下後的秒數、fast＝觸發倒數中、time＝特效時鐘）
export function mineBlink(mesh, t, fast, time) {
  const L = mesh.userData.light;
  L.material.opacity = Math.sin(t * (fast ? 40 : 6)) > 0 ? 1 : 0.15;
  const hm = mesh.userData.halo.material;
  if (hm.uniforms) {
    hm.uniforms.uTime.value = time;
    hm.uniforms.uOp.value = fast ? 1 : 0.55;
    hm.uniforms.uFlash.value = fast ? (Math.sin(t * 40) > 0 ? 1 : 0.4) : 1;
  } else hm.opacity = fast ? 0.6 : 0.18 + 0.08 * Math.sin(t * 3);
}

// 地面光環＋光柱＋標籤（出口、補給台、資料終端、區段的光環；不碰撞、不投影）。userData.ring＝會轉的環
export function buildCampRing(pos, color, title, sub, r) {
  const col = new THREE.Color(color);
  const g = new THREE.Group();
  g.position.copy(pos);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.6 * MS, r, 40),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15 * MS;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.9, r, 60 * MS, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 30 * MS;
  g.add(beam);
  const cv = document.createElement('canvas');
  const lines = sub ? String(sub).split('\n') : [];
  cv.width = 640;
  cv.height = 120 + lines.length * 52 + (lines.length ? 14 : 0);
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(10,14,20,0.78)';
  x.fillRect(0, 0, 640, cv.height);
  x.strokeStyle = '#' + col.getHexString();
  x.lineWidth = 6;
  x.strokeRect(3, 3, 634, cv.height - 6);
  x.fillStyle = '#' + col.getHexString();
  // 寬度不夠時字縮小
  const fit = (txt, px, bold) => {
    x.font = `${bold ? 'bold ' : ''}${px}px sans-serif`;
    const w = x.measureText(txt).width;
    if (w > 600) x.font = `${bold ? 'bold ' : ''}${Math.floor((px * 600) / w)}px sans-serif`;
  };
  x.textAlign = 'center';
  fit(title, 64, true);
  x.fillText(title, 320, 84);
  lines.forEach((ln, i) => {
    x.fillStyle = ln.startsWith('⚠') ? '#ffb070' : '#d8e2ec';
    fit(ln, 40);
    x.fillText(ln, 320, 156 + i * 52);
  });
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(12 * MS, (12 * MS * cv.height) / 640, 1);
  spr.position.y = 9 * MS;
  spr.renderOrder = 10;
  g.add(spr);
  g.userData.ring = ring;
  return g;
}

// 僚機的救援圈（game/wing.js）：綠色的範圍圈＝救援的距離，圈本身兼進度條（12 點方向順時針填滿）
const REV_COL = 0x5fe08a;
export function buildReviveRing(r) {
  const g = new THREE.Group();
  const mat = (op, col = REV_COL) =>
    new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: op,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  const w = 0.7 * MS;
  const base = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 72), mat(0.3)); // 範圍
  const area = new THREE.Mesh(new THREE.CircleGeometry(r - w, 48), mat(0.07)); // 圈內淡淡的底
  // 進度：比範圍圈寬、亮（淡綠接近白），一眼分得出填了多少
  const prog = new THREE.Mesh(
    new THREE.RingGeometry(r - w * 1.6, r + w * 0.5, 72, 1, Math.PI / 2, -0.001),
    mat(1, 0xb8ffd0),
  );
  base.position.y = 0.16 * MS;
  area.position.y = 0.12 * MS;
  prog.position.y = 0.2 * MS;
  for (const m of [area, base, prog]) {
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 6;
    m.userData.noAO = true;
    g.add(m);
  }
  g.userData = { r, w, base, area, prog, k: -1 };
  return g;
}
// k＝進度 0～1、inside＝玩家在圈裡（圈變亮、閃一下）、t＝時間
export function reviveRingSet(g, k, inside, t) {
  const u = g.userData;
  const kk = Math.round(Math.max(0, Math.min(1, k)) * 120) / 120;
  if (kk !== u.k) {
    u.k = kk;
    u.prog.geometry.dispose();
    // 局部 +Y 轉到地面是 −Z（北）；負的角度＝從上面看順時針
    u.prog.geometry = new THREE.RingGeometry(
      u.r - u.w * 1.6,
      u.r + u.w * 0.5,
      72,
      1,
      Math.PI / 2,
      -Math.max(0.001, kk * Math.PI * 2),
    );
  }
  u.prog.visible = kk > 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * (inside ? 8 : 3));
  u.base.material.opacity = inside ? 0.35 + 0.2 * pulse : 0.2 + 0.12 * pulse;
  u.area.material.opacity = inside ? 0.12 : 0.06;
}
