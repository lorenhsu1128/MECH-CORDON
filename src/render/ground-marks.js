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
