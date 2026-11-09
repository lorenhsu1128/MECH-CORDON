// 地面標示頁（library/ground.js）的招式範例：每個會在地上畫預警或留下區域的招式一個腳本。
// 腳本 run(S)：S 是 library/ground-kit.js 的 Run（S.src＝出招的敵人、S.tgt＝玩家，玩家在原點、敵人在 srcAt）。
// 數字照遊戲的呼叫端抄（src 欄位寫了檔案），改了遊戲的招式記得同步這裡。
// 沒有地面標示的招式（點放的槍口閃光、自爆的閃燈…）不列。
import { DS, MS } from '../core/scale.js';
import { V, yawOf } from './ground-kit.js';

export const MOVE_CATS = [
  ['foe', '一般敵人的預警招式'],
  ['special', '特殊一般敵人'],
  ['theme', '地圖專屬敵人'],
  ['boss', 'Boss 的招式'],
  ['b3', 'Boss 最終型態的大招'],
  ['bfield', 'Boss 換型態的場地'],
  ['tier', 'Boss 改版的共通提示'],
  ['trap', '地圖陷阱'],
  ['mission', '任務與區段'],
  ['mech', '機體動作'],
];

const rnd = (a, b) => a + Math.random() * (b - a);
const ang = () => Math.random() * Math.PI * 2;
const tp = (S) => S.tgt.pos.clone();
const tc = (S) => S.tgt.center();
// 玩家周圍 r（舊尺度）的隨機點
const near = (S, r0, r1, c = tp(S)) => S.around(c, ang(), rnd(r0, r1));
const dirTo = (a, b) => b.clone().sub(a).setY(0).normalize();

// ---------- 一般敵人（entities/mech-moves.js 的 moveStart／mv_*；data/ai.js 的 MOVES）----------
const FOE = [
  {
    id: 'mv_lob',
    name: '榴彈（落點圈）',
    who: '榴彈 MT（mt_gren）',
    src: 'entities/mech-moves.js 的 moveStart（lob）',
    srcAt: [0, -20],
    run: (S) => {
      const p = tp(S).add(V(2 * DS, 0, 0));
      S.warnCircle(p, 5 * MS, 1.9, 0xff7020);
      S.lob(S.src.muzzle('rarm'), p, 1.9);
      S.at(1.9, () => S.boom(p, 5 * MS));
    },
  },
  {
    id: 'mv_strafe',
    name: '直升機掃射（航線）',
    who: '直升機（heli）',
    src: 'entities/mech-moves.js 的 moveStart（strafeRun）',
    srcAt: [-6, -40],
    run: (S) => {
      const a = S.src.pos.clone().setY(0),
        b = tp(S).setY(0);
      const dir = dirTo(a, b);
      const end = b.clone().addScaledVector(dir, 22 * DS);
      const c = a.clone().lerp(end, 0.5);
      S.warnRect(c, Math.atan2(-dir.x, -dir.z), 5 * MS, a.distanceTo(end), 1.1, 0xff4020);
      S.every(0.12, 1.4, () => {
        const k = (S.t - 1.1) / 1.4;
        if (k > 0) S.ring(a.clone().lerp(end, k).setY(0.3), 2, 0xffd080, 0.3);
      });
    },
  },
  {
    id: 'mv_dash',
    name: '衝刺（路線預警）',
    who: '霰彈 MT（mt_shot）',
    src: 'entities/mech-moves.js 的 moveStart（dash）',
    srcAt: [0, -16],
    run: (S) => {
      const a = S.src.pos.clone(),
        b = tp(S);
      S.warnPath(a, b, 3 * MS, 0.55, 0xff6020);
      S.at(0.55, () => S.chev(S.src.pos.clone(), dirTo(a, b)));
    },
  },
  {
    id: 'mv_aim',
    name: '架砲（紅色瞄準線）',
    who: '重裝 MT、戰車、直升機（aimShot）',
    src: 'entities/mech-moves.js 的 mv_aimShot（mvLine 每 0.2 秒）',
    srcAt: [4, -26],
    run: (S) => S.every(0.2, 0.7, () => S.warnLine(S.src.muzzle('rarm'), tc(S), 0.24, 0xff3020, 0.04)),
  },
  {
    id: 'mv_volley',
    name: '導彈齊射（橘色鎖定線）',
    who: '重裝 MT、砲台（volley）',
    src: 'entities/mech-moves.js 的 mv_volley',
    srcAt: [-4, -30],
    run: (S) => S.every(0.3, 0.9, () => S.warnLine(S.src.muzzle('rback'), tc(S), 0.34, 0xffa020, 0.03)),
  },
  {
    id: 'mv_charge',
    name: '雷射蓄力（發射前鎖住變白）',
    who: '無人機、步行砲台（charge）',
    src: 'entities/mech-moves.js 的 mv_charge',
    srcAt: [6, -24],
    run: (S) =>
      S.every(0.12, 0.8, () => {
        const lock = S.t > 0.6;
        S.warnLine(S.src.muzzle('rarm'), tc(S), 0.16, lock ? 0xffffff : 0xff2040, 0.03);
      }),
  },
  {
    id: 'mv_sweep',
    name: '掃射（兩條線標出範圍）',
    who: '砲台、戰車（sweep）',
    src: 'entities/mech-moves.js 的 mv_sweep',
    srcAt: [0, -24],
    run: (S) => {
      const c = S.src.center();
      const aim = (a) =>
        c.clone().add(
          tc(S)
            .sub(c)
            .applyAxisAngle(V(0, 1, 0), a),
        );
      S.every(0.3, 0.8, () => {
        S.warnLine(S.src.muzzle('rarm'), aim(-0.45), 0.34, 0xff3020, 0.04);
        S.warnLine(S.src.muzzle('rarm'), aim(0.45), 0.34, 0xff3020, 0.04);
      });
    },
  },
  {
    id: 'ac_charge',
    name: '蓄力武器的瞄準線',
    who: '帶蓄力武器的敵對 AC',
    src: 'entities/mech-entity.js 的 fire（chargeT）',
    srcAt: [-6, -28],
    run: (S) => S.warnLine(S.src.muzzle('rarm'), tc(S), 1.2, 0xff2020, 0.05),
  },
];

// ---------- 特殊一般敵人（entities/mech-special.js、mech-entity.js）----------
const SPECIAL = [
  {
    id: 'sp_mortar',
    name: '迫擊砲',
    who: '迫擊砲 MT（mortar）',
    src: 'entities/mech-special.js（mortarShot，R 5.5）',
    srcAt: [0, -34],
    run: (S) => S.mortar(tp(S).add(V(rnd(-1.5, 1.5) * DS, 0, rnd(-1.5, 1.5) * DS)), 5.5 * MS),
  },
  {
    id: 'sp_mine',
    name: '布雷',
    who: '布雷無人機（minelayer）',
    src: 'entities/mech-special.js（layMine）',
    srcAt: [8, -14],
    run: (S) => {
      for (let i = 0; i < 3; i++)
        S.at(i * 0.8, () => {
          const p = near(S, 2, 6);
          S.beamFx(S.src.center(), p.clone().setY(0.2 * MS), 0xff4030, 0.05);
          S.mine(p, false, 6, i === 0 ? 4 : -1);
        });
    },
  },
  {
    id: 'sp_stomp',
    name: '重踏（地面衝擊波）',
    who: '重踏機甲（stomper）、bastion 型 AC、大型 Boss AC',
    src: 'entities/mech-entity.js 的 aiShock（重踏 R 12、sp 16、預警 0.7）',
    srcAt: [0, -10],
    run: (S) => S.shock(S.src.pos, 12, 16, 0.7),
  },
  {
    id: 'sp_shockAC',
    name: '地面衝擊波（bastion 型 AC）',
    who: 'bastion 型 AC',
    src: 'entities/mech-entity.js 的 aiShock（R 20、sp 20、預警 0.8）',
    srcAt: [0, -12],
    run: (S) => S.shock(S.src.pos, 20, 20, 0.8),
  },
  {
    id: 'sp_shockBoss',
    name: '地面衝擊波（大型 Boss AC）',
    who: 'JUGGERNAUT、STRIDER、BALTEUS 等',
    src: 'entities/mech-entity.js 的 aiShock（R 30、sp 24、預警 0.9）',
    srcAt: [0, -14],
    run: (S) => S.shock(S.src.pos, 30, 24, 0.9),
  },
  {
    id: 'sp_dome',
    name: '護盾被打破',
    who: '護盾產生器（dome）',
    src: 'entities/mech-special.js（ring DOME_R）',
    srcAt: [0, -16],
    run: (S) => S.ring(S.src.center(), 9 * MS, 0x80e0ff),
  },
];

// ---------- 地圖專屬敵人（entities/mech-foe*.js）----------
const THEME = [
  {
    id: 'fo_burrow',
    name: '沙中伏擊者：從腳下鑽出',
    who: '沙丘 burrow',
    src: 'entities/mech-foe.js（warnCircle 4 × MS、0.9 秒）',
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 4 * MS, 0.9);
      S.every(0.05, 0.9, () => S.fx.dust(p.clone(), 3, 6, 0xc9a06a));
      S.at(0.9, () => S.ring(p.clone().setY(0.5), 6, 0xc9a06a));
    },
  },
  {
    id: 'fo_crane',
    name: '起重機砲台：拋貨櫃',
    who: '集散場 crane',
    src: 'game/support.js 的 crateShot（R 4.5 × MS）',
    srcAt: [-10, -40],
    run: (S) => {
      const p = tp(S).add(V(3 * DS, 0, 0));
      const T = 2.2;
      S.warnCircle(p, 4.5 * MS, T);
      S.lob(S.src.muzzle('rarm'), p, T, 0x2b4fb0, 0.9);
      S.at(T, () => S.boom(p, 4.5 * MS));
    },
  },
  {
    id: 'fo_forklift',
    name: '叉架 MT：丟出貨櫃',
    who: '集散場 forklift',
    src: 'entities/mech-foe.js（crateShot R 3.5 × MS、0.9 秒）',
    srcAt: [0, -14],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 3.5 * MS, 0.9);
      S.lob(S.src.muzzle('rarm'), p, 0.9, 0x2b4fb0, 0.9);
      S.at(0.9, () => S.boom(p, 3.5 * MS));
    },
  },
  {
    id: 'fo_gate',
    name: '閘門砲台：開閘的水流',
    who: '水壩 gategun',
    src: 'entities/mech-foe.js（warnRect 2 秒）＋game/support.js 的 addFlow',
    srcAt: [0, -20],
    run: (S) => {
      const d = dirTo(S.src.pos, tp(S));
      const f = { x: S.src.pos.x, z: S.src.pos.z, dx: d.x, dz: d.z, hw: 5 * MS, len: 42 * DS };
      const c = V(f.x + (f.dx * f.len) / 2, 0, f.z + (f.dz * f.len) / 2);
      S.warnRect(c, Math.atan2(f.dx, f.dz), f.hw * 2, f.len, 2, 0x40a0ff);
      S.at(2, () => S.flow(f, 4.5));
    },
  },
  {
    id: 'fo_sprayer',
    name: '汙染噴射 MT：腐蝕區',
    who: '水沒市街 sprayer',
    src: 'entities/mech-foe.js（warnCircle 4.5、1 秒 → addPool 酸）',
    srcAt: [0, -18],
    run: (S) => {
      const at = tp(S);
      S.fx.streaks(
        S.src.muzzle('rarm'),
        12,
        0x9aff40,
        18,
        0.5,
        14,
        at.clone().sub(S.src.muzzle('rarm')).normalize(),
        0.35,
      );
      S.warnCircle(at, 4.5, 1, 0x9aff40);
      S.at(1, () => S.pool(at, 4.5, 6, true));
    },
  },
  {
    id: 'fo_testrig',
    name: '推進器試車台：噴火',
    who: '舊宇宙港 testrig',
    src: 'entities/mech-foe.js（warnRect 8×26、1.5 秒 → flameCone 2.5 秒）',
    srcAt: [0, -16],
    run: (S) => {
      const d = dirTo(S.src.pos, tp(S));
      const c = S.src.pos.clone().addScaledVector(d, 15 * DS);
      S.warnRect(c, Math.atan2(d.x, d.z), 8, 26, 1.5, 0xff8a30);
      S.at(1.5, () => S.every(0.15, 2.5, () => S.flame(S.src.muzzle('rarm'), d, 26 * DS, 0.16, 8)));
    },
  },
  {
    id: 'fo_rammer',
    name: '衝撞無人機：預警線',
    who: '洋上都市 rammer',
    src: 'entities/mech-foe.js（warnLine 0.8 秒）',
    srcAt: [6, -20],
    run: (S) => {
      S.warnLine(S.src.center(), tc(S), 0.8, 0x60e0ff);
      S.at(0.8, () => S.chev(S.src.pos.clone(), dirTo(S.src.pos, tp(S)), 0x60e0ff));
    },
  },
  {
    id: 'fo_undertow',
    name: 'UNDERTOW：貼身推擊',
    who: '洋上都市的專屬 AC',
    src: 'entities/mech-foe.js（shockwave 4）',
    srcAt: [0, -4],
    run: (S) => S.ring(tc(S), 4, 0x40c0e0, 0.3),
  },
  {
    id: 'fo_marker',
    name: '軌道標定衛星：標定',
    who: '高空軌道 marker',
    src: 'entities/mech-foe.js（beam＋ring 3）',
    srcAt: [8, -30],
    run: (S) => {
      S.beamFx(S.src.muzzle('rarm'), tc(S), 0xff5050, 0.12);
      S.ring(tc(S), 3, 0xff5050);
    },
  },
  {
    id: 'fo_junk',
    name: '廢鐵合成體：吸附補強外殼',
    who: '荒野 junk',
    src: 'entities/mech-foe.js（ring 5）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.center(), 5, 0xc07040),
  },
  {
    id: 'fo_blob',
    name: '實驗體融合',
    who: '技研都市 blob',
    src: 'entities/mech-foe.js（shockwave 6）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.pos.clone().setY(S.src.pos.y + 1), 6, 0xff3a30),
  },
  {
    id: 'fo_specimen',
    name: 'SPECIMEN：過載',
    who: '技研都市的專屬 AC',
    src: 'entities/mech-foe.js（shockwave 5）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.center(), 5, 0xff3a30, 0.4),
  },
  // B1（entities/mech-foe-b1.js）
  {
    id: 'b1_harpoon',
    name: '魚叉拖車：魚叉預警線',
    who: '荒野 harpoon',
    src: 'entities/mech-foe-b1.js（warnLine 0.8 秒）',
    srcAt: [-6, -20],
    run: (S) => S.warnLine(S.src.muzzle('rarm'), tc(S), 0.8, 0xff3020, 0.05),
  },
  {
    id: 'b1_smoker',
    name: '煙幕投射車：煙幕彈',
    who: '荒野 smoker',
    src: 'entities/mech-foe-b1.js（warnCircle 8 × MS → addZone smoke 10 秒）',
    srcAt: [0, -34],
    run: (S) => {
      const p = tp(S).add(V(-3 * DS, 0, -2 * DS));
      const T = 1.8;
      S.warnCircle(p, 8 * MS, T, 0xd0d4dc);
      S.lob(S.src.muzzle('rback'), p, T, 0xb8bcc4);
      S.at(T, () => {
        S.fx.dust(p.clone(), 8, 26, 0xb8bcc2);
        S.zone('smoke', p, 8 * MS, 10);
      });
    },
  },
  {
    id: 'b1_twister',
    name: '旋風產生機：旋風',
    who: '沙丘 twister',
    src: 'entities/mech-foe-b1.js（ring 3 → addZone suction 5 × MS、8 秒，追著目標）',
    srcAt: [0, -22],
    run: (S) => {
      S.ring(S.src.pos.clone().setY(0.3), 3, 0xffb050);
      S.at(1.2, () => {
        const d = dirTo(S.src.pos, tp(S));
        const p = S.src.pos.clone().addScaledVector(d, 4 * MS);
        S.zone('suction', p, 5 * MS, 8, {
          to: p,
          move: (z, dt) => {
            const v = dirTo(z.p, tp(S)).multiplyScalar(4.5 * DS * dt);
            z.p.add(v);
            z.to.copy(z.p);
            z.mesh.position.x = z.p.x;
            z.mesh.position.z = z.p.z;
          },
        });
      });
    },
  },
  {
    id: 'b1_blaster',
    name: '坍方爆破手：落石',
    who: '礦坑 blaster',
    src: 'entities/mech-foe-b1.js（warnLine 往上＋warnCircle 4.5 × MS、2 秒）',
    srcAt: [-8, -20],
    run: (S) => {
      const p = tp(S);
      const top = p.clone().setY(26 * DS);
      S.warnLine(S.src.muzzle('rarm'), top, 0.5, 0xffa030, 0.05);
      S.warnCircle(p, 4.5 * MS, 2, 0xffa020);
      S.at(2, () => {
        S.boom(p, 4.5 * MS, 0x9a8e80);
        S.fx.dust(p.clone(), 6, 18, 0x8a7e70);
      });
    },
  },
  {
    id: 'b1_lamp',
    name: '礦燈哨兵：探照燈',
    who: '礦坑 lamp',
    src: 'entities/mech-foe-b1.js（addZone spot，距離 40、半角 0.28）',
    srcAt: [0, -26],
    run: (S) => S.spot(S.src.center().setY(3 * MS), 7, 0.28),
  },
  // B2（entities/mech-foe-b2.js）
  {
    id: 'b2_riveter',
    name: '鉚釘槍 MT：瞄準線與黏性鉚釘',
    who: '集散場 riveter',
    src: 'entities/mech-foe-b2.js（warnLine 0.7 秒、命中 ring 1.2）',
    srcAt: [4, -18],
    run: (S) => {
      S.warnLine(S.src.muzzle('rarm'), tc(S), 0.7, 0xffa030);
      S.at(0.8, () => S.ring(tc(S), 1.2, 0xffa030));
    },
  },
  {
    id: 'b2_welder',
    name: '電焊 MT：電弧預警',
    who: '集散場 welder',
    src: 'entities/mech-foe-b2.js（warnLine 0.8 秒）',
    srcAt: [0, -8],
    run: (S) => S.warnLine(S.src.muzzle('rarm'), tc(S), 0.8, 0x60a8ff),
  },
  {
    id: 'b2_water',
    name: '高壓水砲車：水柱預警',
    who: '水壩 watercannon',
    src: 'entities/mech-foe-b2.js（warnLine 1.2 秒）',
    srcAt: [0, -24],
    run: (S) => S.warnLine(S.src.muzzle('rarm'), tc(S), 1.2, 0xe8f4ff, 0.1),
  },
  {
    id: 'b2_turbine',
    name: '渦輪吸入機：吸入',
    who: '水壩 turbine',
    src: 'entities/mech-foe-b2.js（warnCircle 18 × MS、1.5 秒 → addZone suction 6 秒）',
    srcAt: [0, -16],
    run: (S) => {
      const p = S.src.pos.clone();
      S.warnCircle(p, 18 * MS, 1.5, 0x60c0ff);
      S.at(1.5, () => S.zone('suction', p, 18 * MS, 6, { to: p }));
    },
  },
  {
    id: 'b2_eel',
    name: '電鰻無人機：水面放電',
    who: '水沒市街 eel',
    src: 'entities/mech-foe-b2.js（warnCircle 14 × MS、1.5 秒 → addZone electro 4 秒）',
    srcAt: [0, -10],
    run: (S) => {
      const p = S.src.pos.clone().lerp(tp(S), 0.6);
      S.warnCircle(p, 14 * MS, 1.5, 0x60e8ff);
      S.at(1.5, () => {
        S.ring(p.clone().setY(0.3), 14, 0x60e8ff);
        S.zone('electro', p, 14 * MS, 4);
      });
    },
  },
  // C1（entities/mech-foe-c1.js）
  {
    id: 'c1_cryo',
    name: '冷凍噴霧機：錐形冷凍霧',
    who: '冰原 cryo',
    src: 'entities/mech-foe-c1.js（warnRect 7 × MS × 14、0.8＋1.4 秒）',
    srcAt: [0, -10],
    run: (S) => {
      const d = dirTo(S.src.pos, tp(S));
      const c = S.src.pos.clone().addScaledVector(d, 7 * DS);
      S.warnRect(c, Math.atan2(d.x, d.z), 7 * MS, 14 * DS, 2.2, 0x9fe8ff);
      S.at(0.8, () =>
        S.every(0.1, 1.4, () => S.fx.dust(c.clone().addScaledVector(d, rnd(-6, 6) * DS), 3, 3, 0xe8f4ff)),
      );
    },
  },
  {
    id: 'c1_icemortar',
    name: '冰錐迫擊砲：白圈',
    who: '冰原 icemortar',
    src: 'entities/mech-foe-c1.js（warnCircle 4 × MS、1.5 秒）',
    srcAt: [0, -30],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 4 * MS, 1.5, 0xffffff);
      S.lob(S.src.muzzle('rback'), p, 1.5, 0xcff4ff);
      S.at(1.5, () => S.boom(p, 4 * MS, 0xcff4ff));
    },
  },
  {
    id: 'c1_parasite',
    name: '寄生纏附體：撲擊預警',
    who: '技研都市 parasite',
    src: 'entities/mech-foe-c1.js（warnLine 0.7 秒）',
    srcAt: [3, -8],
    run: (S) => S.warnLine(S.src.center(), tc(S), 0.7, 0xff3a30),
  },
  {
    id: 'c1_anchor',
    name: '重力錨：重力圈',
    who: 'Grid 086 anchor',
    src: 'entities/mech-foe-c1.js（warnCircle 14 × MS＋warnLine、1.2 秒 → addZone gravity 8 秒）',
    srcAt: [0, -26],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 14 * MS, 1.2, 0xb060ff);
      S.warnLine(S.src.muzzle('rarm'), p.clone().setY(0.5), 1.2, 0xb060ff);
      S.at(1.2, () => {
        S.beamFx(S.src.muzzle('rarm'), p.clone().setY(0.3), 0xb060ff, 0.14);
        S.ring(p.clone().setY(0.3), 14, 0xb060ff, 0.6);
        S.zone('gravity', p, 14 * MS, 8);
      });
    },
  },
  {
    id: 'c1_zipline',
    name: '滑索突擊兵：纜索預警',
    who: 'Grid 086 zipline',
    src: 'entities/mech-foe-c1.js（warnLine）',
    srcAt: [-10, -20],
    run: (S) => {
      const hook = S.src.pos.clone().setY(14 * MS);
      const dest = tp(S).add(V(0, 0, 3 * DS));
      S.warnLine(hook, dest.setY(1.2 * MS), 1.6, 0xffd040, 0.08);
    },
  },
  // C2（entities/mech-foe-c2.js）
  {
    id: 'c2_fueler',
    name: '燃料洩漏車：油漬點火',
    who: '舊宇宙港 fueler',
    src: 'entities/mech-foe-c2.js（addZone fuel 7 × MS、2.5 秒點火）',
    srcAt: [-6, -12],
    run: (S) => S.fuel(near(S, 0, 3), 7 * MS, 2.5, 6),
  },
  {
    id: 'c2_fuelerDie',
    name: '燃料洩漏車：擊破後大範圍燃燒',
    who: '舊宇宙港 fueler',
    src: 'entities/mech-foe-c2.js（addPool 9、9 秒）',
    srcAt: [0, -10],
    run: (S) => {
      S.boom(S.src.pos, 6 * MS);
      S.pool(S.src.pos, 9, 7);
    },
  },
  {
    id: 'c2_rack',
    name: '誘導飛彈架：預警線',
    who: '舊宇宙港 missilerack',
    src: 'entities/mech-foe-c2.js（warnLine 1.2 秒）',
    srcAt: [8, -30],
    run: (S) => S.warnLine(S.src.muzzle('rarm'), tc(S), 1.2, 0xff7030, 0.09),
  },
  {
    id: 'c2_netter',
    name: '拋網無人機：捕獲網',
    who: '洋上都市 netter',
    src: 'entities/mech-foe-c2.js（warnLine 0.8 秒、命中 ring 2.4）',
    srcAt: [6, -16],
    run: (S) => {
      S.warnLine(S.src.muzzle('rarm'), tc(S), 0.8, 0xe0f8ff, 0.07);
      S.at(1.1, () => S.ring(tc(S), 2.4, 0xe0f8ff));
    },
  },
  {
    id: 'c2_boomer',
    name: '迴旋刃無人機：預警線',
    who: '洋上都市 boomer',
    src: 'entities/mech-foe-c2.js（warnLine 0.7 秒）',
    srcAt: [-6, -18],
    run: (S) => S.warnLine(S.src.muzzle('rarm'), tp(S).add(V(0, 1.2 * MS, -2 * DS)), 0.7, 0xffb040, 0.08),
  },
  {
    id: 'c2_mirror',
    name: '反射鏡衛星：聚光光束',
    who: '高空軌道 mirror',
    src: 'entities/mech-foe-c2.js（warnLine 1 秒）',
    srcAt: [8, -26],
    run: (S) => {
      S.warnLine(S.src.muzzle('rarm'), tc(S), 1.0, 0xfff080, 0.07);
      S.at(1, () => S.beamFx(S.src.muzzle('rarm'), tc(S), 0xfff080, 0.25));
    },
  },
  {
    id: 'c2_focus',
    name: '聚光鏡陣列：追蹤光束',
    who: '高空軌道 focus',
    src: 'entities/mech-foe-c2.js（warnLine 1.2 秒 → addZone beam 6 秒、4 秒到最痛）',
    srcAt: [10, -30],
    run: (S) => {
      const fz = S.src.muzzle('rarm');
      S.warnLine(fz, tc(S), 1.2, 0xfff080, 0.09);
      S.at(1.2, () => S.trackBeam(fz, tc(S), 6, 4));
    },
  },
  // E1（entities/mech-foe-e1.js，火山熔爐帶）
  {
    id: 'e1_slagger',
    name: '熔渣投擲機：熔渣（落點 → 燃燒地面）',
    who: '火山熔爐帶 slagger',
    src: 'entities/mech-foe-e1.js（warnCircle 5 × MS、1.2 秒 → addPool 5、6 秒）',
    srcAt: [0, -40],
    run: (S) => {
      const p = tp(S).add(V(2 * DS, 0, 0));
      S.warnCircle(p, 5 * MS, 1.2, 0xff6a20);
      S.lob(S.src.muzzle('rarm'), p, 1.2, 0xff6a20);
      S.at(1.2, () => (S.boom(p, 5 * MS), S.pool(p, 5, 6)));
    },
  },
  {
    id: 'e1_heatguard',
    name: '耐熱重裝 MT：火焰噴射',
    who: '火山熔爐帶 heatguard',
    src: 'entities/mech-foe-e1.js（flameCone 射程 14 × 0.55、2 秒）',
    srcAt: [0, -10],
    run: (S) =>
      S.every(0.2, 2, () => S.flame(S.src.muzzle('rarm'), dirTo(S.src.pos, tp(S)), 14 * DS * 0.55, 0.3, 8)),
  },
  {
    id: 'e1_magmadrone',
    name: '熔岩潛行無人機：浮出的火光',
    who: '火山熔爐帶 magmadrone',
    src: 'entities/mech-foe-e1.js（warnCircle 3 × MS、1 秒）',
    srcAt: [0, -8],
    run: (S) => {
      const p = S.src.pos.clone();
      S.warnCircle(p, 3 * MS, 1, 0xff7a20);
      S.every(0.1, 1, () => S.fx.dust(p.clone(), 2, 3, 0xff8a40));
      S.at(1, () => S.ring(p.clone().setY(0.5), 4, 0xff7a20));
    },
  },
  {
    id: 'e1_bellows',
    name: '熱風鼓風機：熱風',
    who: '火山熔爐帶 bellows',
    src: 'entities/mech-foe-e1.js（蓄氣 1.4 秒 → flameCone 22 × 0.4）',
    srcAt: [0, -14],
    run: (S) =>
      S.at(1.4, () =>
        S.every(0.1, 0.8, () =>
          S.flame(S.src.muzzle('rarm'), dirTo(S.src.pos, tp(S)), 22 * DS * 0.4, 0.35, 6),
        ),
      ),
  },
  // E2（entities/mech-foe-e2.js，移動要塞「方舟」）
  {
    id: 'e2_boarder',
    name: '登艦突擊兵：撲擊（落點 → 爆炸）',
    who: '方舟 boarder',
    src: 'entities/mech-foe-e2.js（warnCircle 6 × MS、0.9 秒 → 突擊推進、shockwave）',
    srcAt: [0, -24],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 6 * MS, 0.9, 0xff3020);
      S.at(1.3, () => (S.boom(p, 6 * MS), S.ring(p.clone().setY(0.3), 6, 0xff6040)));
    },
  },
  {
    id: 'e2_railgunner',
    name: '甲板軌道砲兵：瞄準線 → 貫穿光束',
    who: '方舟 railgunner',
    src: 'entities/mech-foe-e2.js（warnLine 每 0.12 秒、1.8 秒 → beamAttack 60）',
    srcAt: [0, -40],
    run: (S) => {
      const from = S.src.muzzle('rarm');
      S.every(0.12, 1.8, () => S.warnLine(from, tc(S), 0.14, 0x60c0ff, 0.08));
      S.at(1.8, () => S.beamFx(from, tc(S), 0x9fe8ff, 0.5));
    },
  },
  {
    id: 'e2_spotter',
    name: '艦橋觀測無人機：引導砲擊（3 發）',
    who: '方舟 spotter',
    src: 'entities/mech-foe-e2.js（warnCircle 5 × MS、1.3 秒起，每發晚 0.25 秒）',
    srcAt: [0, -28],
    run: (S) => {
      for (let i = 0; i < 3; i++) {
        const p = tp(S).add(V((i - 1) * 6 * DS, 0, i ? 4 * DS : 0));
        S.warnCircle(p, 5 * MS, 1.3 + i * 0.25, 0xffd040);
        S.at(1.3 + i * 0.25, () => S.boom(p, 5 * MS, 0xffa040));
      }
    },
  },
];

// ---------- Boss 的招式 ----------
const BOSS = [
  {
    id: 'bs_artSalvo',
    name: '砲兵陣地：砲台的三連發',
    who: 'BASTILLE（artillery）的砲台',
    src: 'entities/mech-boss.js 的 partAI（3 發、R 5 × MS）',
    srcAt: [0, -40],
    run: (S) => {
      const c = tp(S);
      for (let i = 0; i < 3; i++) S.mortar(S.around(c, ang(), i ? rnd(3, 6) : rnd(0, 1.5)), 5 * MS);
    },
  },
  {
    id: 'bs_artBarrage',
    name: '砲兵陣地：砲擊彈幕',
    who: 'BASTILLE（artillery）',
    src: 'entities/mech-boss.js 的 artilleryAI（8 發、0.18 秒、半徑 18）',
    srcAt: [0, -44],
    run: (S) => {
      const c = tp(S);
      for (let i = 0; i < 8; i++) S.at(i * 0.18, () => S.mortar(S.around(c, ang(), rnd(0, 18)), 5 * MS));
    },
  },
  {
    id: 'bs_artMines',
    name: '砲兵陣地：開場的地雷圈',
    who: 'BASTILLE（artillery）',
    src: 'game/bosses.js 的 spawnBossKind（半徑 14 × 11 顆、18 × 31 顆；這裡畫一部分）',
    srcAt: [0, -6],
    run: (S) => {
      const c = S.src.pos.clone();
      for (let i = 0; i < 11; i++) S.mine(S.around(c, (i / 11) * 6.283, 14), false, 8);
    },
  },
  {
    id: 'bs_wormErupt',
    name: '鑽地蟲：鑽出（預警圈 → 衝擊波）',
    who: 'SANDWORM（worm）',
    src: 'entities/mech-boss.js 的 wormAI（warnCircle 7 × MS、1 秒 → shockStart R 18）',
    srcAt: [0, -6],
    run: (S) => {
      const p = tp(S).add(V(2 * DS, 0, -1 * DS));
      S.warnCircle(p, 7 * MS, 1.0);
      S.every(0.08, 1, () => S.fx.dust(p.clone(), 3, 4, 0xb09070));
      S.at(1, () => {
        S.shock(p, 18, 22, 0);
        S.boom(p, 6 * MS, 0xc8a070);
      });
    },
  },
  {
    id: 'bs_wormSweep',
    name: '鑽地蟲：地下衝刺、沿路噴發',
    who: 'SANDWORM（第二型態）',
    src: 'entities/mech-boss.js 的 wormAI（每 0.4 秒 shockStart R 6、預警 0.35）',
    srcAt: [-20, -20],
    run: (S) => {
      const a = S.src.pos.clone(),
        b = tp(S).add(V(14 * DS, 0, 10 * DS));
      for (let i = 0; i < 6; i++) S.at(i * 0.4, () => S.shock(a.clone().lerp(b, i / 5), 6, 12, 0.35));
    },
  },
  {
    id: 'bs_wormDive',
    name: '鑽地蟲：鑽回地下',
    who: 'SANDWORM（worm）',
    src: 'entities/mech-boss.js 的 wormAI（shockStart R 14、sp 18）',
    srcAt: [0, -12],
    run: (S) => S.shock(S.src.pos, 14, 18, 0),
  },
  {
    id: 'bs_spiderSlam',
    name: '多足要塞：躍起落地',
    who: 'ARACHNE（spider）',
    src: 'entities/mech-boss.js 的 spiderAI（shockStart R 26、預警 0.2）',
    srcAt: [0, -14],
    run: (S) =>
      S.at(0.6, () => (S.shock(S.src.pos, 26, 22, 0.2), S.fx.dust(S.src.pos.clone(), 7, 20, 0xb09070))),
  },
  {
    id: 'bs_fortBomb',
    name: '空中要塞：投彈',
    who: 'LEVIATHAN（fortress）',
    src: 'entities/mech-boss.js 的 fortressAI（6 發、0.22 秒、間隔 5）',
    srcAt: [-14, -24],
    run: (S) => {
      const d = V(1, 0, 0.3).normalize();
      for (let i = 0; i < 6; i++) {
        const k = i - 2.5;
        S.at(i * 0.22, () =>
          S.mortar(tp(S).addScaledVector(d, k * 5 * DS), 5 * MS, undefined, S.src.center().setY(16 * MS)),
        );
      }
    },
  },
  {
    id: 'bs_hunterEmp',
    name: '電磁狩獵機：EMP',
    who: 'NULLIFIER（hunter）',
    src: 'entities/mech-boss.js 的 hunterAI（warnCircle 20 × MS、1.3 秒）＋game/bosses.js 的 hunterEmp',
    srcAt: [0, -10],
    run: (S) => {
      const p = S.src.pos.clone();
      S.warnCircle(p, 20 * MS, 1.3, 0x40a0ff);
      S.at(1.3, () => {
        S.ring(p.clone().setY(1), 20, 0x60a8ff, 0.5);
        S.fx.arc(S.src.center(), 4, 0x80c8ff);
        S.ring(tc(S), 3, 0x80c8ff);
      });
    },
  },
  {
    id: 'bs_rail',
    name: '電磁砲台：貫穿砲擊',
    who: 'HALBERD（railgun）',
    src: 'entities/mech-boss2.js 的 railgunAI（瞄準線跟上目標 → beamAttack＋shockwave 7）',
    srcAt: [-20, -50],
    run: (S) => {
      const mz = S.src.muzzle('rback');
      S.every(0.15, 2.4, () => {
        const k = S.t / 2.4;
        S.warnLine(mz, tc(S), 0.18, k > 0.8 ? 0xffffff : 0xff2020, 0.05 + k * 0.12);
      });
      S.at(2.4, () => {
        const end = mz.clone().addScaledVector(tc(S).sub(mz).normalize(), 180 * DS);
        S.beamFx(mz, end, 0x9fe8ff, 0.9);
        S.ring(mz.clone(), 7, 0x9fe8ff, 0.4);
      });
    },
  },
  {
    id: 'bs_trainRam',
    name: '武裝列車：全速衝撞',
    who: 'IRON CITADEL（train）',
    src: 'entities/mech-boss2.js 的 trainAI（warnRect 6 × MS × 56、1.2 秒）',
    srcAt: [-30, 0],
    run: (S) => S.warnRect(V(-6 * DS, 0, 0), yawOf(V(1, 0, 0)), 6 * MS, 56 * DS, 1.2),
  },
  {
    id: 'bs_trainLaser',
    name: '武裝列車：雷射車廂',
    who: 'IRON CITADEL 的車廂（car_laser）',
    src: 'entities/mech-boss2.js 的 carAI（warnLine 0.9 秒、長 70）',
    srcAt: [-20, -14],
    run: (S) => {
      const f = S.src.center();
      const d = tc(S).sub(f).normalize();
      S.warnLine(f, f.clone().addScaledVector(d, 70 * DS), 0.9, 0xff3070, 0.1);
      S.at(0.9, () => S.beamFx(f, f.clone().addScaledVector(d, 70 * DS), 0xff3070, 0.3));
    },
  },
  {
    id: 'bs_trainMine',
    name: '武裝列車：布雷車廂',
    who: 'IRON CITADEL 的車廂（car_mine）',
    src: 'entities/mech-boss2.js 的 carAI（每 2.2 秒 layMine）',
    srcAt: [-14, -8],
    run: (S) => {
      for (let i = 0; i < 4; i++) S.at(i * 0.5, () => S.mine(S.g(-14 + i * 7, -8), false, 6));
    },
  },
  {
    id: 'bs_slag',
    name: '熔爐清掃機：熔渣（落點 → 燃燒地面）',
    who: 'CINDER（furnace）',
    src: 'game/bosses2.js 的 slagShot（R 3.5、留下 4.2 的燃燒地面）',
    srcAt: [0, -30],
    run: (S) => {
      for (let i = 0; i < 3; i++) {
        const p = i ? near(S, 3, 9) : tp(S);
        const T = S.mortar(p, 3.5 * DS);
        S.at(T, () => S.pool(p, 4.2, 7));
      }
    },
  },
  {
    id: 'bs_firewall',
    name: '熔爐清掃機：火牆',
    who: 'CINDER（furnace）',
    src: 'entities/mech-boss2.js 的 furnaceAI（warnPath 0.9 秒、寬 5.6 → 7 處 addPool 2.8）',
    srcAt: [0, -20],
    run: (S) => {
      const d = dirTo(S.src.pos, tp(S));
      const side = V(-d.z, 0, d.x);
      const pts = [];
      for (let i = -3; i <= 3; i++) pts.push(tp(S).addScaledVector(side, i * 4.6 * MS));
      S.warnPath(pts[0].clone().setY(0), pts[6].clone().setY(0), 5.6 * DS, 0.9, 0xff6a20);
      S.flame(S.src.muzzle('rarm'), d.clone().setY(0.3).normalize(), 10 * DS, 0.3, 14);
      S.at(0.9, () => pts.forEach((p, i) => S.at(i * 0.08, () => S.pool(p, 2.8, 6))));
    },
  },
  {
    id: 'bs_flame',
    name: '熔爐清掃機：近身火焰',
    who: 'CINDER（furnace）',
    src: 'entities/mech-boss2.js 的 furnaceAI（flameCone 每 0.07 秒、2 秒）',
    srcAt: [0, -6],
    run: (S) =>
      S.at(0.7, () =>
        S.every(0.07, 2, () =>
          S.flame(S.src.muzzle('rarm'), dirTo(S.src.pos, tp(S)).setY(-0.05).normalize(), 8 * DS, 0.45, 5),
        ),
      ),
  },
  {
    id: 'bs_heat',
    name: '熔爐清掃機：對空熱浪',
    who: 'CINDER（furnace）',
    src: 'entities/mech-boss2.js 的 furnaceAI（warnCircle 9 × MS、1 秒）',
    srcAt: [0, -16],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 9 * MS, 1.0, 0xff8a30);
      S.at(1, () => {
        S.flame(p.clone().setY(0.5), V(0, 1, 0), 14 * DS, 0.35, 24);
        S.ring(p.clone().setY(0.3), 10, 0xff8a30);
      });
    },
  },
  {
    id: 'bs_orbitalTrack',
    name: '衛星砲導引塔：追蹤光柱（近似）',
    who: 'JUDGEMENT（orbital）',
    src: 'entities/mech-boss2.js 的 orbitalAI／boss2Fx（光柱本體是 Boss 身上的網格；這裡以連續的光柱示意它追著目標走）',
    srcAt: [0, -40],
    run: (S) => {
      const a = tp(S).add(V(-14 * DS, 0, -10 * DS));
      for (let i = 0; i < 10; i++) S.at(i * 0.3, () => S.pillar(a.clone().lerp(tp(S), i / 9), 2.4 * MS));
    },
  },
  {
    id: 'bs_orbitalGrid',
    name: '衛星砲導引塔：格子砲擊',
    who: 'JUDGEMENT（第二型態）',
    src: 'entities/mech-boss2.js 的 orbitalGrid（5×5 格、留一條安全直行、4 波）',
    srcAt: [0, -46],
    run: (S) => {
      const C = 9 * MS;
      for (let w = 0; w < 4; w++) {
        const safe = Math.floor(Math.random() * 5);
        S.at(w * 1.5, () => {
          const cells = [];
          for (let i = 0; i < 5; i++) {
            if (i === safe) continue;
            for (let j = 0; j < 5; j++) {
              const p = V((i - 2) * C, 0, (j - 2) * C);
              cells.push(p);
              S.warnRect(p, 0, C - 0.4 * MS, C - 0.4 * MS, 1.2, 0x60c8ff);
            }
          }
          S.at(1.2, () => cells.forEach((p) => S.pillar(p, 2.4 * MS)));
        });
      }
    },
  },
  {
    id: 'bs_viperRun',
    name: '高速突擊機：進場航線',
    who: 'VIPER（interceptor）',
    src: 'entities/mech-boss2.js 的 interceptorAI（warnRect 8 × MS × 120、1.6 秒）',
    srcAt: [-40, -30],
    run: (S) => {
      const d = dirTo(S.src.pos, tp(S));
      S.warnRect(tp(S), yawOf(d), 8 * MS, 120 * DS, 1.6);
      S.at(1.6, () =>
        S.every(0.1, 1.2, () =>
          S.ring(
            tp(S)
              .addScaledVector(d, ((S.t - 1.6) / 1.2 - 0.5) * 100 * DS)
              .setY(0.3),
            3,
            0xffffff,
            0.3,
          ),
        ),
      );
    },
  },
  {
    id: 'bs_viperMines',
    name: '高速突擊機：沿途的空雷',
    who: 'VIPER（第二型態）',
    src: 'entities/mech-boss2.js 的 interceptorAI（每 0.3 秒 layMine air）',
    srcAt: [-30, -10],
    run: (S) => {
      for (let i = 0; i < 8; i++) S.at(i * 0.3, () => S.mine(S.v(-30 + i * 8, rnd(2, 6) * MS, -10), true, 5));
    },
  },
  {
    id: 'bs_rampart',
    name: '衝撞推土要塞：衝撞路線',
    who: 'BEHEMOTH（rampart）',
    src: 'entities/mech-boss2.js 的 rampartAim（warnRect 9 × MS、預警 1.5）',
    srcAt: [0, -36],
    run: (S) => {
      const d = dirTo(S.src.pos, tp(S));
      const L = 75 * DS;
      S.warnRect(S.src.pos.clone().addScaledVector(d, L / 2), yawOf(d), 9 * MS, L, 1.5);
    },
  },
  {
    id: 'bs_ibisPulse',
    name: '脈衝刃翼：擴散能量環',
    who: 'PULSAR（ibis）',
    src: 'game/bosses2.js 的 pulseRing（R 48、sp 24；第二型態連發 3 次）',
    srcAt: [0, -20],
    run: (S) => {
      for (let i = 0; i < 3; i++) S.at(1 + i * 0.55, () => S.pulse(S.src.center(), 48, 24));
    },
  },
  {
    id: 'bs_ibisFan',
    name: '脈衝刃翼：雷射扇形',
    who: 'PULSAR（ibis）',
    src: 'entities/mech-boss2.js 的 ibisAI（5 道、間隔 12°、預警 0.8）',
    srcAt: [0, -26],
    run: (S) => {
      const from = S.src.center();
      const base = tc(S).sub(from).normalize();
      for (let i = -2; i <= 2; i++) {
        const v = base.clone().applyAxisAngle(V(0, 1, 0), (i * 12 * Math.PI) / 180);
        S.warnLine(from, from.clone().addScaledVector(v, 60 * DS), 0.8, 0xff3050, 0.08);
        S.at(0.8, () => S.beamFx(from, from.clone().addScaledVector(v, 60 * DS), 0xff5070, 0.22));
      }
    },
  },
  {
    id: 'bs_ibisDash',
    name: '脈衝刃翼：直線突刺',
    who: 'PULSAR（ibis）',
    src: 'entities/mech-boss2.js 的 ibisAI（warnPath 0.6 秒、寬 6.4 × MS）',
    srcAt: [0, -24],
    run: (S) => {
      const from = S.src.center();
      const d = tc(S).sub(from);
      const L = d.length() + 22 * DS;
      S.warnPath(
        from.clone().setY(0),
        from.clone().addScaledVector(d.normalize(), L).setY(0),
        6.4 * MS,
        0.6,
        0xff5070,
      );
    },
  },
  {
    id: 'bs_trinity',
    name: '三機合體：重新合體',
    who: 'CERBERUS（trinity）',
    src: 'entities/mech-boss2.js 的 trinityAI（ring 10）',
    srcAt: [0, -16],
    run: (S) => (S.boom(S.src.pos, 6 * MS, 0xff7040), S.ring(S.src.center(), 10, 0xff7040)),
  },
  {
    id: 'bs_phase',
    name: '換型態：衝擊環＋地面衝擊波',
    who: '所有地面的 Boss',
    src: 'game/bosses.js 的 bossPhaseShift（shockwave 20、shockStart R 26、預警 1）',
    srcAt: [0, -14],
    run: (S) => {
      S.ring(S.src.center(), 20, 0xff3020, 0.7);
      S.shock(S.src.pos, 26, 22, 1.0);
    },
  },
  {
    id: 'bs_enrage',
    name: '狂暴化',
    who: '所有 Boss（6 分鐘後、雙 Boss 的僚機被擊破）',
    src: 'game/bosses.js（shockwave 22）',
    srcAt: [0, -16],
    run: (S) => S.ring(S.src.center(), 22, 0xff2010, 0.8),
  },
];

// ---------- Boss 最終型態的大招（entities/mech-boss3.js 的 SPECIALS）----------
// 零件（b3Rain／b3Line／b3Shock／b3Erupt／b3Ring／b3Mines／b3Pools／b3Beam…）照 mech-boss3.js
const b3 = {
  rain(S, n, R, gap) {
    const c = tp(S);
    for (let i = 0; i < n; i++)
      S.at(i * gap, () => S.mortar(S.around(c, ang(), i === 0 ? rnd(0, 2) : rnd(2, R)), 5 * MS));
  },
  line(S, n, step, gap) {
    const d = dirTo(S.src.pos, tp(S));
    const start = tp(S).addScaledVector(d, -step * DS * (n / 2));
    for (let i = 0; i < n; i++)
      S.at(i * gap, () => S.mortar(start.clone().addScaledVector(d, i * step * DS), 4.5 * MS));
  },
  shock(S, R) {
    S.shock(S.src.pos, R, 22, 0.9);
  },
  shocks(S, n, gap) {
    for (let i = 0; i < n; i++) S.at(i * gap, () => b3.shock(S, 18 + i * 6));
  },
  erupt(S, n, R) {
    const a0 = ang();
    for (let i = 0; i < n; i++)
      S.at(i * 0.35, () => S.shock(S.around(tp(S), a0 + (i / n) * Math.PI * 2, R * 0.6), 7, 12, 0.8));
  },
  ring(S, R) {
    S.pulse(S.src.center(), R, 22);
  },
  mines(S, n, R, air = false) {
    for (let i = 0; i < n; i++) {
      const p = S.around(tp(S), (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), rnd(R * 0.5, R));
      if (air) p.y = rnd(2, 7) * MS;
      S.mine(p, air, air ? 5 : 6);
    }
  },
  pools(S, n, R) {
    for (let i = 0; i < n; i++) {
      const p = S.around(tp(S), (i / n) * Math.PI * 2, R * 0.7);
      S.mortar(p, 4 * MS);
      S.at(1.8, () => S.pool(p, 4.5, 6));
    }
  },
  volley(S, n, gap) {
    for (let i = 0; i < n; i++) S.at(i * gap, () => S.ring(S.src.muzzle('rarm'), 1.5, 0xffd080, 0.25)); // 武器連射（槍口；沒有地面標示）
  },
  beam(S, from, dir, dl, range = 80) {
    S.beam(from, dir, dl, range);
  },
  cross(S) {
    const c = tc(S);
    const a = Math.random() * Math.PI;
    for (const t of [a, a + Math.PI / 2]) {
      const d = V(Math.cos(t), 0, Math.sin(t));
      b3.beam(S, c.clone().addScaledVector(d, -45 * DS), d, 1.0, 90);
    }
  },
  fan(S, n, step) {
    const from = S.src.center();
    const d0 = tc(S).sub(from);
    const yaw = Math.atan2(d0.x, d0.z);
    const pitch = Math.atan2(d0.y, Math.hypot(d0.x, d0.z) || 1);
    for (let i = 0; i < n; i++) {
      const y = yaw + (i - (n - 1) / 2) * step;
      b3.beam(
        S,
        from.clone(),
        V(Math.sin(y) * Math.cos(pitch), Math.sin(pitch), Math.cos(y) * Math.cos(pitch)),
        1.1,
        120,
      );
    }
  },
  cage(S, n, R) {
    const c = tc(S);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const from = c.clone().add(V(Math.cos(a) * R * DS, 4 * MS, Math.sin(a) * R * DS));
      b3.beam(S, from, c.clone().sub(from).normalize(), 1.2, R * 2.2);
    }
  },
  pillars(S, n, R) {
    for (let i = 0; i < n; i++) {
      const p = i === 0 ? tp(S) : S.around(tp(S), ang(), rnd(3, R));
      const dl = 1.3 + i * 0.15;
      S.warnCircle(p, 3.5 * MS, dl);
      S.at(dl, () => (S.bolt(p.clone().setY(60 * MS), p), S.pillar(p, 3.5 * MS)));
    }
  },
};
const B3 = [
  ['JUGGERNAUT', 'JUGGERNAUT', '砲擊連段', (S) => (b3.shock(S, 26), b3.rain(S, 6, 10, 0.5))],
  ['mirror', 'DOPPEL（複製 AC）', '適應過載', (S) => (b3.volley(S, 3, 0.35), b3.mines(S, 5, 9))],
  ['flagship', 'AEGIS（護盾指揮艦）', '艦砲齊射', (S) => b3.line(S, 8, 4.5, 0.12)],
  ['interceptor', 'VIPER（高速突擊機）', '空雷封鎖', (S) => b3.mines(S, 8, 10, true)],
  ['STRIDER', 'STRIDER', '十字雷射', (S) => b3.cross(S)],
  ['railgun', 'HALBERD（電磁砲台）', '散射砲', (S) => b3.fan(S, 5, 0.22)],
  ['worm', 'SANDWORM（鑽地蟲）', '地表崩塌', (S) => b3.erupt(S, 5, 9)],
  ['funnel', 'SERAPHIM（浮游砲指揮機）', '光束牢籠', (S) => b3.cage(S, 6, 16)],
  ['heli', 'HELIOS（大型直升機）', '地毯轟炸', (S) => b3.line(S, 9, 4, 0.1)],
  ['furnace', 'CINDER（熔爐清掃機）', '火海', (S) => (b3.pools(S, 5, 9), b3.ring(S, 36))],
  ['artillery', 'BASTILLE（砲兵陣地）', '飽和砲擊', (S) => b3.rain(S, 12, 18, 0.25)],
  ['rampart', 'BEHEMOTH（衝撞推土要塞）', '碎石雨', (S) => (b3.shock(S, 22), b3.rain(S, 6, 12, 0.4))],
  ['duo', 'IGUAZU & VOLTA', '連攜齊射', (S) => b3.volley(S, 4, 0.3)],
  ['phantom', 'MIRAGE（光學迷彩電戰機）', '分身突襲', (S) => b3.ring(S, 28)],
  ['spider', 'ARACHNE（多足要塞）', '震地', (S) => (b3.shocks(S, 3, 0.8), b3.mines(S, 4, 8))],
  ['orbital', 'JUDGEMENT（衛星砲導引塔）', '雙重光柱', (S) => b3.pillars(S, 6, 12)],
  ['BALTEUS', 'BALTEUS', '導彈牆', (S) => (b3.volley(S, 4, 0.25), b3.ring(S, 32))],
  ['trinity', 'CERBERUS（三機合體）', '三重衝擊', (S) => b3.shocks(S, 3, 0.7)],
  ['hunter', 'NULLIFIER（電磁狩獵機）', '電磁風暴', (S) => (b3.ring(S, 40), b3.mines(S, 6, 10))],
  ['train', 'IRON CITADEL（武裝列車）', '全車廂砲擊', (S) => b3.rain(S, 10, 16, 0.2)],
  ['fortress', 'LEVIATHAN（空中要塞）', '全彈發射', (S) => (b3.rain(S, 10, 14, 0.2), b3.fan(S, 3, 0.3))],
  ['ibis', 'PULSAR（脈衝刃翼）', '雙環', (S) => (b3.ring(S, 44), S.at(0.7, () => b3.ring(S, 44)))],
].map(([k, boss, name, run]) => ({
  id: 'b3_' + k,
  name: `${name}`,
  who: boss + '（第三型態；Boss 改版時是蓄力後的大招）',
  src: `entities/mech-boss3.js 的 SPECIALS.${k}`,
  srcAt: [0, -22],
  run,
}));

// ---------- Boss 換型態的場地（data/boss-kit.js 的 FIELD；game/boss-field.js 的 bfAround／bfHaze／bfBelt／bfCrates）----------
const SAND = 0xc8a070,
  SMOKE = 0x8a8e96,
  SNOW = 0xeef6ff;
const around = (S, kind, where, n, R, o = {}) => {
  for (let i = 0; i < n; i++) {
    let p;
    if (where === 'line') p = tp(S).lerp(S.src.pos, (i + 1) / (n + 1));
    else {
      const c = where === 'boss' ? S.src.pos : tp(S);
      p = S.around(c, (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.8, n > 1 ? rnd(10, 20) : 0);
    }
    S.field(kind, p, R, 9, o);
  }
};
const haze = (S, color, R) => S.field('haze', tp(S).lerp(S.src.pos, 0.5), R, 9, { color });
const minefield = (S, R, o = {}) =>
  S.field('minefield', tp(S), R, 9, { ...o, trig: [{ t: 2.5, p: tp(S).add(V(3 * DS, 0, 2 * DS)) }] });
const belt = (S) =>
  S.belt(S.src.pos.clone().addScaledVector(dirTo(S.src.pos, tp(S)), 6 * DS), dirTo(S.src.pos, tp(S)), 9);
const crates = (S, n) => {
  for (let i = 0; i < n; i++) {
    const p = S.around(tp(S), (i / n) * Math.PI * 2 + Math.random(), rnd(8, 18));
    S.warnCircle(p, 5 * DS, 1.2);
    S.at(1.2, () => (S.boom(p, 5 * DS), S.fx.dust(p.clone(), 4, 14, 0x7a6a58)));
  }
};
const BF = [
  [
    'artillery',
    'BASTILLE',
    '二型：地雷區擴大／三型：塵土',
    (S) => (minefield(S, 16), S.at(1, () => haze(S, SAND, 20))),
  ],
  [
    'worm',
    'SANDWORM',
    '二型：流沙區／三型：地面塌陷',
    (S) => (around(S, 'quicksand', 'player', 1, 14), around(S, 'collapse', 'player', 3, 7)),
  ],
  ['JUGGERNAUT', 'JUGGERNAUT', '三型：移動的燃燒帶', (S) => belt(S)],
  ['railgun', 'HALBERD', '三型：煙霧', (S) => haze(S, SMOKE, 18)],
  ['heli', 'HELIOS', '二型：燃燒帶／三型：煙霧', (S) => (belt(S), haze(S, SMOKE, 20))],
  ['rampart', 'BEHEMOTH', '三型：塌陷（兩者之間）', (S) => around(S, 'collapse', 'line', 2, 7)],
  ['train', 'IRON CITADEL', '三型：軌道兩側起火', (S) => around(S, 'magma', 'boss', 4, 9)],
  [
    'furnace',
    'CINDER',
    '二型：熔岩裂地擴大／三型：蒸氣的安全區',
    (S) => (around(S, 'magma', 'player', 5, 8), around(S, 'steam', 'player', 2, 12)),
  ],
  [
    'STRIDER',
    'STRIDER',
    '二型：冰面／三型：暴風雪',
    (S) => (around(S, 'ice', 'player', 1, 22), haze(S, SNOW, 24)),
  ],
  ['phantom', 'MIRAGE', '二型：煙霧區', (S) => haze(S, SMOKE, 20)],
  [
    'ibis',
    'PULSAR',
    '二型：能量殘留區（紫色的電擊地面）',
    (S) => around(S, 'shock', 'player', 3, 7, { color: '#b07dff' }),
  ],
  [
    'spider',
    'ARACHNE',
    '二型：平台崩落／三型：煙霧',
    (S) => (around(S, 'collapse', 'player', 2, 8), haze(S, SMOKE, 18)),
  ],
  ['trinity', 'CERBERUS', '二型：吊掛的貨櫃落下', (S) => crates(S, 3)],
  ['hunter', 'NULLIFIER', '二型：電擊地面', (S) => around(S, 'shock', 'player', 3, 7)],
  ['orbital', 'JUDGEMENT', '二型：光柱打過的地面燃燒', (S) => around(S, 'magma', 'player', 4, 7)],
  [
    'flagship',
    'AEGIS',
    '二型：甲板邊緣崩落／三型：煙霧',
    (S) => (around(S, 'collapse', 'player', 2, 8), haze(S, SMOKE, 18)),
  ],
  ['fortress', 'LEVIATHAN', '二型：熔岩裂地', (S) => around(S, 'magma', 'player', 4, 8)],
  ['interceptor', 'VIPER', '二型：空雷殘留區', (S) => minefield(S, 18, { air: true })],
  [
    'funnel',
    'SERAPHIM',
    '二型：浮游砲殘骸的電擊區',
    (S) => around(S, 'shock', 'player', 3, 6, { color: '#b07dff' }),
  ],
  ['mirror', 'DOPPEL', '二型：布雷區', (S) => minefield(S, 16)],
  [
    'BALTEUS',
    'BALTEUS',
    '二型：熔岩裂地／三型：燃燒帶',
    (S) => (around(S, 'magma', 'player', 4, 8), belt(S)),
  ],
].map(([k, boss, name, run]) => ({
  id: 'bf_' + k,
  name: `${boss}：${name}`,
  who: boss + '（Boss 改版的場地變化；掩體、作戰區域縮小不是地面標示，不畫）',
  src: `data/boss-kit.js 的 FIELD.${k}`,
  srcAt: [0, -30],
  run,
}));

// ---------- Boss 改版的共通提示（entities/mech-boss-tier.js）----------
const TIER = [
  [
    'tr_charge',
    '大招開始蓄力',
    'tierTick（shockwave 8、橘）',
    (S) => S.ring(S.src.center(), 8, 0xff6020, 0.6),
  ],
  [
    'tr_guard',
    '蓄力中的正面護盾（guard）',
    'tierTick（每 0.35 秒 ring 3 × DS）',
    (S) =>
      S.every(0.35, 2.5, () =>
        S.ring(S.src.center().addScaledVector(dirTo(S.src.pos, tp(S)), 4 * DS), 3 * DS, 0x60c0ff),
      ),
  ],
  [
    'tr_half',
    '打斷 1／2（要再打斷一次）',
    'tierGauge（shockwave 8、藍）',
    (S) => S.ring(S.src.center(), 8, 0x7fd8ff, 0.4),
  ],
  ['tr_break', '打斷！', 'tierInterrupt（shockwave 14）', (S) => S.ring(S.src.center(), 14, 0x7fd8ff, 0.7)],
  ['tr_open', '破綻！', 'bossOpen（shockwave 7、金）', (S) => S.ring(S.src.center(), 7, 0xffd040, 0.45)],
  [
    'tr_openGlow',
    '破綻中的金色光環',
    'tierFx（每 0.3 秒 ring 4 × DS）',
    (S) => S.every(0.3, 3, () => S.ring(S.src.center(), 4 * DS, 0xffd040)),
  ],
  [
    'tr_counter',
    '反擊點（完美 QB 之後）',
    'tierCounterOn（shockwave 5）',
    (S) => S.ring(S.src.center(), 5, 0x50a8ff, 0.4),
  ],
  ['tr_armor', '脈衝裝甲破壞', 'tierArmorK（shockwave 9）', (S) => S.ring(S.src.center(), 9, 0x60e0ff, 0.5)],
  [
    'tr_bk',
    '破甲彈命中',
    'tierHitMods（shockwave 10、紫）',
    (S) => S.ring(S.src.center(), 10, 0xff70ff, 0.5),
  ],
  [
    'tr_reflect',
    '打回去（彈體被打掉）',
    'tierReflect（shockwave 3）',
    (S) => S.ring(S.src.center().lerp(tc(S), 0.5), 3, 0x7fd8ff, 0.3),
  ],
  [
    'tr_reflectPool',
    '打回去（燃燒地面型）',
    'tierReflect 的 reflectPool（addPool 7）',
    (S) => S.pool(S.src.pos, 7, 6),
  ],
].map(([id, name, f, run]) => ({
  id,
  name,
  who: '有刁鑽度的 Boss（Boss 改版）',
  src: 'entities/mech-boss-tier.js 的 ' + f,
  srcAt: [0, -18],
  run,
}));

// ---------- 地圖陷阱（data/devices.js 的 fx、game/devices-traps.js 的 trapHit／trapVis）----------
// trap：DEVICES 的鍵（模型 render/trap-models.js）。zone 的特效照 trapVis（每 0.12 秒兩顆）
const TRAP = [
  ['crane', '吊掛的貨櫃', '集散場'],
  ['shock', '電擊地板', '模擬訓練場'],
  ['mine', '坍方點', '礦坑'],
  ['ice', '冰面裂縫', '冰原'],
  ['pylon', '輸電鐵塔', '荒野'],
  ['gas', '天然氣井', '沙丘'],
  ['cable', '斷掉的電纜', '水沒市街'],
  ['sluice', '閘口控制台', '水壩'],
  ['testrig', '推進器試車台', '舊宇宙港'],
  ['scrap', '吊掛的廢料', 'Grid 086'],
  ['valve', '海水閥', '洋上都市'],
  ['airlock', '氣閘', '高空軌道'],
  ['coral', 'Coral 收容槽', '技研都市'],
].map(([k, name, theme]) => ({
  id: 'tp_' + k,
  name: `${name}（${theme}）`,
  who: `地圖互動裝置：${theme}的環境陷阱`,
  src: `data/devices.js 的 DEVICES.${k}＋game/devices-traps.js 的 trapHit／trapVis`,
  trap: k,
  run: (S) => S.trap(k),
}));

// ---------- 任務與區段 ----------
const MISSION = [
  {
    id: 'ms_wave',
    name: '增援預告的光柱',
    who: '增援波次（自由出擊、主線）；撤離區段的增援',
    src: 'game/waves.js 的 waveLaunch（邊緣進入紅色、空降橘色）／game/seg-ops.js',
    run: (S) => {
      const a = S.g(-20, -30),
        b = S.g(24, -26);
      S.warnLine(a, a.clone().setY(45), 3.5, 0xff3030, 0.5);
      S.warnLine(b, b.clone().setY(45), 3.5, 0xffa020, 0.5);
    },
  },
  {
    id: 'ms_collapse',
    name: '結構倒塌的範圍',
    who: '地圖物件的破壞：承重柱倒塌、平台與橋倒下',
    src: 'game/destruct.js（warnRect，紅 → 倒下的揚塵 shockwave）',
    run: (S) => {
      S.warnRect(S.g(0, -16), 0, 30 * DS * 0.6, 16 * DS, 2.2, 0xff3020);
      S.at(2.2, () => S.ring(S.v(0, 0.2, -16), 30, 0xd8c8a8, 0.6));
    },
  },
  {
    id: 'ms_volatile',
    name: '敵人詞綴「殉爆」：擊破後爆炸',
    who: '帶「殉爆」詞綴的敵人',
    src: 'game/affix.js（warnCircle VOL_R＝9 × DS、1.1 秒 → 爆炸＋shockwave）',
    srcAt: [0, -12],
    run: (S) => {
      const c = S.src.center();
      S.warnCircle(c, 9 * DS, 1.1, 0xff5020);
      S.at(1.1, () => (S.boom(c, 9 * DS, 0xff8030), S.ring(c, 9 * DS, 0xffb060, 0.5)));
    },
  },
  {
    id: 'ms_split',
    name: '敵人詞綴「分裂」',
    who: '帶「分裂」詞綴的敵人',
    src: 'game/affix.js（shockwave 4 × dk）',
    srcAt: [0, -12],
    run: (S) => S.ring(S.src.center(), 4 * MS, 0xffd060, 0.35),
  },
  {
    id: 'ms_exit',
    name: '主線的出口',
    who: '主線區段清除後',
    src: 'game/campaign.js 的 campSpawnExits（campRing＋ring 6）',
    run: (S) => {
      const p = S.g(-10, -16),
        q = S.g(12, -16);
      S.campRing(p, 0xffb020, '出口', '下一段：殲滅\n獎勵：資金', 5 * MS, 8);
      S.ring(p.clone().setY(0.2), 6, 0xffb020);
      S.campRing(q, 0x7fc8ff, '出口', '下一段：補給', 5 * MS, 8);
      S.ring(q.clone().setY(0.2), 6, 0xffb020);
    },
  },
  {
    id: 'ms_choice',
    name: '抉擇的出口',
    who: '有陣營抉擇的區段',
    src: 'game/campaign.js 的 campSpawnExits（choice，ring 紅）',
    run: (S) => {
      const p = S.g(-10, -16),
        q = S.g(12, -16);
      S.campRing(p, 0xff8a50, '抉擇', '選項 A', 5 * MS, 8);
      S.ring(p.clone().setY(0.2), 6, 0xff5050);
      S.campRing(q, 0xff8a50, '抉擇', '選項 B', 5 * MS, 8);
      S.ring(q.clone().setY(0.2), 6, 0xff5050);
    },
  },
  {
    id: 'ms_pad',
    name: '補給台與資料終端',
    who: '補給區段、情報區段',
    src: 'game/campaign.js 的 campRing（PAD_R）',
    run: (S) => {
      S.campRing(S.g(-10, -12), 0x7ee081, '補給', '', 3.5 * MS, 8);
      S.campRing(S.g(10, -12), 0x7fc8ff, '資料終端', '', 3.5 * MS, 8);
    },
  },
  {
    id: 'ms_lz',
    name: '撤離：回收地點',
    who: '撤離區段',
    src: 'game/seg-ops.js 的 segLzRing',
    run: (S) => {
      S.campRing(S.g(-12, -14), 0xffb020, '回收地點', '回收機正在趕來', 7 * MS, 8);
      S.campRing(S.g(12, -14), 0x7ee081, '回收地點', '回收機抵達：站進來裝載', 7 * MS, 8);
    },
  },
  {
    id: 'ms_escape',
    name: '追擊：逃脫點',
    who: '追擊區段',
    src: 'game/seg-ops.js（segRing esc）',
    run: (S) => S.campRing(S.g(0, -16), 0xff4d4d, '逃脫點', '運輸車抵達這裡就失敗', 7 * MS, 8),
  },
  {
    id: 'ms_front',
    name: '大規模戰場：據點',
    who: '大規模戰場區段',
    src: 'game/seg-ops.js 的 segFrontRing（我方藍、目前黃、敵方紅）',
    run: (S) => {
      S.campRing(S.g(-20, -16), 0x5cc8ff, '據點 A', '我方佔領', 8 * MS, 8);
      S.campRing(S.g(0, -20), 0xffd060, '據點 B', '站進來佔領（我方比敵方多時）', 8 * MS, 8);
      S.campRing(S.g(20, -16), 0xff6a50, '據點 C', '敵方據點', 8 * MS, 8);
    },
  },
  {
    id: 'ms_pickup',
    name: '撿到東西',
    who: '補給箱、修理、彈藥、據點的箱子',
    src: 'game/map-extras.js、game/outposts.js（ring 5）',
    run: (S) => {
      S.ring(S.v(-8, 1.5 * MS, -10), 5, 0x7ee081);
      S.at(0.5, () => S.ring(S.v(0, 1.5 * MS, -10), 5, 0xffe070));
      S.at(1, () => S.ring(S.v(8, 1.5 * MS, -10), 5, 0xffc040));
    },
  },
  {
    id: 'ms_void',
    name: '墜落後拉回平台',
    who: '洋上都市、高空軌道（虛空）',
    src: 'entities/mech-entity.js 的 voidCheck（ring 4）',
    run: (S) => S.ring(S.v(0, 0.1, -8), 4, 0x80c8ff),
  },
];

// ---------- 機體動作 ----------
const MECH = [
  {
    id: 'mc_qb',
    name: 'QB（往後噴的箭頭）',
    who: '所有機體',
    src: 'entities/mech-entity.js（QB：chevrons 往反方向＋揚塵）',
    run: (S) => {
      S.chev(S.g(0, -8), V(1, 0, 0));
      S.fx.dust(S.g(0, -8), 2.2, 7);
      S.at(0.8, () => S.chev(S.g(0, -8), V(0, 0, 1)));
    },
  },
  {
    id: 'mc_jump',
    name: '跳躍與空中跳（往下噴的箭頭）',
    who: '所有機體',
    src: 'entities/mech-entity.js 的 jumpMove（起跳＋空中跳：chevrons 往下）',
    run: (S) => {
      S.chev(S.g(0, -8), V(0, -1, 0));
      S.fx.dust(S.g(0, -8), 2.4, 8);
      S.at(0.6, () => S.chev(S.v(0, 7 * MS, -8), V(0, -1, 0)));
      S.at(1.1, () => S.chev(S.v(0, 12 * MS, -8), V(0, -1, 0)));
    },
  },
  {
    id: 'mc_thrust',
    name: '突刺（往前的箭頭）',
    who: '近戰的突刺招式',
    src: 'entities/mech-entity.js 的 meleeStart（st.thrust：chevrons）',
    run: (S) => S.chev(S.g(0, -8), V(0, 0, -1), 0x7fd8ff),
  },
  {
    id: 'mc_cue',
    name: '反擊提示「!」的紅環',
    who: '敵人對玩家出手前（防禦反擊的時機）',
    src: 'entities/mech-entity.js 的 cueTick（ring 3）',
    srcAt: [0, -6],
    run: (S) => S.ring(S.src.center(), 3, 0xff4030),
  },
  {
    id: 'mc_parry',
    name: '彈刀',
    who: '近戰互擊',
    src: 'entities/mech-entity.js 的 meleeClash（shockwave 4）',
    srcAt: [0, -4],
    run: (S) => S.ring(tc(S).lerp(S.src.center(), 0.5), 4, 0xffd070, 0.3),
  },
  {
    id: 'mc_legend',
    name: '傳說模組：踏地與過載',
    who: '主線的傳說模組（踏地衝擊、過載放電、殉爆）',
    src: 'entities/mech-legend.js（shockwave）',
    run: (S) => {
      S.ring(S.v(0, 0.3, -6), 10, 0x9fd8ff, 0.5);
      S.at(0.7, () => S.ring(S.v(0, 1.5 * MS, -6), 8, 0x7fc8ff, 0.5));
      S.at(1.4, () => S.ring(S.v(0, 1.5 * MS, -6), 12, 0xffb040, 0.7));
    },
  },
  {
    id: 'mc_killBlast',
    name: '戰術模組：連鎖殉爆、殉爆脈衝',
    who: '主線的戰術模組',
    src: 'game/tactics.js 的 modKillFx',
    srcAt: [0, -12],
    run: (S) => {
      S.ring(S.src.center(), 8, 0xff8030, 0.35);
      S.at(0.6, () => S.ring(S.src.center(), 12, 0x9fd8ff, 0.4));
    },
  },
  {
    id: 'mc_gear',
    name: '零件品級：專屬與金色詞條',
    who: '特製／傳說零件（玩家與敵人）：偏向場、音爆、不倒、蓄能盾、電漿雲、燒夷、地上的裝備光柱',
    src: 'entities/mech-gear-fx.js（ring）、entities/mech-gear-gold.js（shockwave、addPool）、game/gear-loot.js（ring）',
    srcAt: [0, -10],
    run: (S) => {
      S.ring(S.src.center(), 4, 0x80c8ff, 0.3); // 偏向場
      S.at(0.5, () => S.ring(S.src.center(), 8, 0xbfe8ff, 0.3)); // 音爆
      S.at(1.0, () => S.ring(S.src.center(), 12, 0xffd080, 0.45)); // 不倒
      S.at(1.5, () => S.pool(S.g(0, -4), 3, 4, true)); // 電漿雲
      S.at(2.0, () => S.pool(S.g(4, -6), 5, 6)); // 燒夷
    },
  },
];

// ---------- 其他（各系統的命中、反應、出現時的地面環）----------
const MORE_SPECIAL = [
  {
    id: 'sp_emp',
    name: 'EMP 電磁脈衝',
    who: 'EMP-S／EMP-L 肩上武器、EMP-9 電磁槍（玩家與敵人）',
    src: 'game/game.js 的 empPulse（shockwave 半徑＋貼地的 ring 0.6 倍；EMP-S 半徑 12）',
    srcAt: [0, -12],
    run: (S) => {
      const c = S.src.center();
      S.ring(c, 12, 0x80c8ff, 0.9);
      S.ring(c.clone().setY(0.2), 12 * 0.6, 0x80c8ff);
      S.at(0.3, () => S.ring(tc(S), 3, 0x6fb8ff));
    },
  },
  {
    id: 'sp_interrupt',
    name: '打斷招式（弱點打壞）',
    who: '一般敵人的預警招式被打斷',
    src: 'entities/mech-weak.js 的 wpBreak（ring 4、金）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.center(), 4, 0xffd040),
  },
  {
    id: 'sp_spawn',
    name: '敵人出現',
    who: '所有生成的敵人',
    src: 'game/mission.js 的 spawnEnemy（ring 4、紅）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.pos.clone(), 4, 0xff4040),
  },
  {
    id: 'sp_scav',
    name: '拾荒強化',
    who: '撿同伴零件強化的敵人（scav）',
    src: 'game/mission.js 的 foeScavenge（ring 3）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.center(), 3, 0xc8702a),
  },
  {
    id: 'sp_berserk',
    name: '敵人詞綴「狂暴」',
    who: '帶「狂暴」詞綴的敵人（AP 低於門檻）',
    src: 'entities/mech-affix.js（shockwave 5 × dk）',
    srcAt: [0, -14],
    run: (S) => S.ring(S.src.center(), 5 * MS, 0xff4030, 0.4),
  },
];
const MORE_BOSS = [
  // 主線擴充第 7、8 章的新 Boss（entities/mech-boss4.js、game/bosses4.js）
  {
    id: 'b4_anvil',
    name: 'ANVIL 鍛造巨人：巨鎚（落點 → 震波＋熔岩裂地）',
    who: 'ANVIL（anvil）',
    src: 'entities/mech-boss4.js 的 anvilAI（warnCircle 7 × MS、1.1 秒 → shockwave、addPool 2.6 × 3）',
    srcAt: [0, -26],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 7 * MS, 1.1, 0xff4020);
      S.at(1.1, () => {
        S.boom(p, 7 * MS, 0xff8030);
        S.ring(p.clone().setY(0.3), 7, 0xffa060);
        for (let i = 1; i <= 3; i++) S.pool(S.src.pos.clone().lerp(p, i / 4), 2.6, 7);
      });
    },
  },
  {
    id: 'b4_salamander',
    name: 'SALAMANDER 熔岩潛龍：鑽出（火光 → 噴發）',
    who: 'SALAMANDER（salamander）',
    src: 'entities/mech-boss4.js 的 salaAI（warnCircle 6 × MS、1 秒 → explodeAt、addPool 4）',
    srcAt: [0, -20],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 6 * MS, 1, 0xff6a20);
      S.at(1, () => (S.boom(p, 6 * MS, 0xff6a20), S.pool(p, 4, 8)));
    },
  },
  {
    id: 'b4_gantry',
    name: 'GANTRY 船塢起重要塞：吊下貨櫃、吊鉤砸地',
    who: 'GANTRY（gantry）',
    src: 'entities/mech-boss4.js 的 gantryAI（warnCircle 6 × MS、1.2 秒；砸地 10 × MS、0.7 秒）',
    srcAt: [0, -12],
    run: (S) => {
      const p = tp(S);
      S.warnCircle(p, 6 * MS, 1.2, 0xff4020);
      S.at(1.2, () => S.boom(p, 5.5 * MS, 0xffb060));
      const q = S.src.pos.clone();
      S.at(2, () => S.warnCircle(q, 10 * MS, 0.7, 0xff4020));
      S.at(2.7, () => S.ring(q.clone().setY(0.3), 10, 0x80d0ff));
    },
  },
  {
    id: 'b4_deckgun',
    name: 'COLOSSUS 主砲塔：主砲齊射（長方形）',
    who: 'COLOSSUS（deckgun）',
    src: 'entities/mech-boss4.js 的 deckgunAI（warnRect 10 × MS × 92 × DS、1.4 秒 → 12 發爆炸）',
    srcAt: [0, -50],
    run: (S) => {
      const f = dirTo(S.src.pos, tp(S));
      const yaw = Math.atan2(-f.x, -f.z);
      const mid = S.src.pos
        .clone()
        .addScaledVector(f, 52 * DS)
        .setY(0.1);
      S.warnRect(mid, yaw, 10 * MS, 92 * DS, 1.4);
      for (let i = 0; i < 12; i++)
        S.at(1.4 + i * 0.05, () =>
          S.boom(
            S.src.pos
              .clone()
              .addScaledVector(f, (10 + i * 7.5) * DS)
              .setY(0),
            5 * MS,
          ),
        );
    },
  },
  {
    id: 'b4_reactor',
    name: 'HEARTH 機關心臟：脈衝環、縫隙的光束',
    who: 'HEARTH（reactor）',
    src: 'entities/mech-boss4.js 的 reactorAI（pulseRing 44；b3Beam × 4、1 秒）',
    srcAt: [0, -26],
    run: (S) => {
      const c = S.src.center();
      S.pulse(c, 44, 0xff5070);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        S.at(1.5, () => S.beam(c, V(-Math.sin(a), 0, -Math.cos(a)), 1, 75));
      }
    },
  },
  {
    id: 'b4_sovereign',
    name: 'SOVEREIGN 方舟的主權者：認證（只有一條安全的光帶）',
    who: 'SOVEREIGN（sovereign）',
    src: 'entities/mech-boss4.js 的 sovereignAI（warnRect 12 × MS × 110 × DS、1.5 秒 × 4 條；game/bosses4.js 的 sovEcho4：pillarStrike）',
    srcAt: [0, -40],
    run: (S) => {
      const c = tp(S);
      for (let k = -2; k <= 2; k++) {
        if (k === 1) continue;
        const mid = c
          .clone()
          .add(V(k * 13 * MS, 0, 0))
          .setY(0.1);
        S.warnRect(mid, 0, 12 * MS, 110 * DS, 1.5, 0x80d0ff);
        S.at(1.5, () => S.pillar(mid, 6 * MS, 0x80d0ff));
      }
    },
  },
  {
    id: 'bs_trinitySplit',
    name: '三機合體：分離機體出現',
    who: 'CERBERUS（trinity）',
    src: 'game/bosses2.js 的 trinitySplit（每台 ring 5）',
    srcAt: [0, -18],
    run: (S) =>
      [-10, 0, 10].forEach((x, i) => S.at(i * 0.15, () => S.ring(S.v(x, 1.6 * MS, -18), 5, 0xff7040))),
  },
  {
    id: 'bs_squad',
    name: 'Boss 改版：雜兵小隊空降',
    who: '有刁鑽度的 Boss',
    src: 'game/boss-tier.js 的 bossTierTick（每台 ring 4）',
    srcAt: [0, -24],
    run: (S) => [-8, 0, 8].forEach((x, i) => S.at(i * 0.2, () => S.ring(S.v(x, 0.1, -16), 4, 0xff9040))),
  },
  {
    id: 'bs_colossus',
    name: '大型兵器：停機與擊破',
    who: '主線的大型兵器區段（多足巨兵、陸上戰艦）',
    src: 'game/seg-colossus.js（停機 shockwave 14 × MS、擊破 20 × MS）',
    srcAt: [0, -40],
    run: (S) => {
      S.boom(S.src.pos, 8 * MS, 0xffa040);
      S.ring(S.src.pos.clone(), 14 * MS, 0xffd090, 0.6);
      S.at(1.6, () => (S.boom(S.src.pos, 14 * MS, 0xff8030), S.ring(S.src.center(), 20 * MS, 0xffb060, 0.8)));
    },
  },
];
const MORE_MISSION = [
  {
    id: 'ms_wingRevive',
    name: '救援僚機',
    who: '主線的僚機（站在倒下的僚機旁邊）',
    src: 'game/wing.js（ring 6、綠）',
    run: (S) => S.ring(S.v(6, 1.6 * MS, -6), 6, 0x80ffb0),
  },
  {
    id: 'ms_ally',
    name: '友軍空降支援',
    who: '消耗品「友軍」',
    src: 'game/mission.js 的 callAlly（ring 6、綠）',
    run: (S) => S.ring(S.v(6, 0.1, -6), 6, 0x80ffb0),
  },
  {
    id: 'ms_drop',
    name: '增援空降的落地',
    who: '增援波次的空降',
    src: 'game/waves.js 的 waveSpawn（shockwave 8、橘）',
    run: (S) => S.ring(S.g(0, -20), 8, 0xffa020, 0.5),
  },
  {
    id: 'ms_level',
    name: '自訂關卡：觸發器的增援預告',
    who: '自訂關卡（觸發器「生成增援」帶預告）',
    src: 'game/level-play.js 的 lvSpawnGroup（光柱 45 × DS；空降落地 shockwave 8）',
    run: (S) => {
      const a = S.g(-12, -24),
        b = S.g(12, -24);
      S.warnLine(a, a.clone().setY(45 * DS), 3.5, 0xff3030, 0.5);
      S.warnLine(b, b.clone().setY(45 * DS), 3.5, 0xffa020, 0.5);
      S.at(3, () => S.ring(b, 8, 0xffa020, 0.5));
    },
  },
  {
    id: 'ms_gunBreak',
    name: '固定砲台被打壞',
    who: '地圖互動裝置：固定砲台',
    src: 'game/devices-guns.js 的 gunBreak（shockwave 5）',
    run: (S) => (S.boom(S.g(0, -12), 4 * MS, 0xffa040), S.ring(S.v(0, 1.5 * MS, -12), 5, 0xffd090, 0.4)),
  },
  {
    id: 'ms_flamer',
    name: '重武器：火焰放射器',
    who: '撿起的重武器（火焰放射器）',
    src: 'game/devices-guns.js 的 hwTick（flameCone）',
    run: (S) => S.every(0.1, 2.5, () => S.flame(S.tgt.muzzle('rarm'), V(0, 0, -1), 12 * DS, 0.25, 6)),
  },
];
const MORE_MECH = [
  {
    id: 'mc_pqb',
    name: '完美 QB',
    who: '玩家（提示中按 QB）',
    src: 'game/feedback.js 的 pqbFx（shockwave 6）',
    run: (S) => S.ring(tc(S), 6, 0x9fe8ff, 0.35),
  },
  {
    id: 'mc_counter',
    name: '反擊（邊閃邊打）',
    who: '玩家（遠程的反擊時間）',
    src: 'game/ranged.js 的 rbCtrFx（shockwave 7）',
    run: (S) => S.ring(tc(S), 7, 0x7fd8ff, 0.4),
  },
  {
    id: 'mc_charge',
    name: '蓄力射擊的強力彈',
    who: '玩家（按住蓄力）',
    src: 'entities/mech-charge.js 的 pwFireFx（槍口前 shockwave 2.2）',
    run: (S) => S.ring(S.tgt.muzzle('rarm').add(V(0, 0, -1.5 * DS)), 2.2, 0x9fe8ff, 0.25),
  },
  {
    id: 'mc_react',
    name: '屬性反應',
    who: '先後用兩種屬性打中同一個目標',
    src: 'entities/mech-react.js 的 rxFire（shockwave 4 × dk、反應的顏色）',
    srcAt: [0, -14],
    run: (S) => {
      S.ring(S.src.center(), 4 * MS, 0xff8a30, 0.35);
      S.at(0.6, () => S.ring(S.src.center(), 4 * MS, 0x7fd8ff, 0.35));
      S.at(1.2, () => S.ring(S.src.center(), 4 * MS, 0xc080ff, 0.35));
    },
  },
  {
    id: 'mc_status',
    name: '狀態效果：中招與掙脫',
    who: '鉤住、黏附炸彈、纏附、捕獲網…',
    src: 'entities/mech-status.js（中招 shockwave 3.2、掙脫 4 白）',
    run: (S) => (S.ring(tc(S), 3.2, 0xff8a30, 0.35), S.at(0.9, () => S.ring(tc(S), 4, 0xffffff, 0.3))),
  },
  {
    id: 'mc_stagger',
    name: '打出失衡（客機）',
    who: '多人的客機看到的失衡',
    src: 'entities/mech-remote.js（ring 5、紅）',
    srcAt: [0, -12],
    run: (S) => S.ring(S.src.center(), 5, 0xff4040),
  },
];

export const MOVES = [
  ...FOE.map((m) => ({ ...m, cat: 'foe' })),
  ...[...SPECIAL, ...MORE_SPECIAL].map((m) => ({ ...m, cat: 'special' })),
  ...THEME.map((m) => ({ ...m, cat: 'theme' })),
  ...[...BOSS, ...MORE_BOSS].map((m) => ({ ...m, cat: 'boss' })),
  ...B3.map((m) => ({ ...m, cat: 'b3' })),
  ...BF.map((m) => ({ ...m, cat: 'bfield' })),
  ...TIER.map((m) => ({ ...m, cat: 'tier' })),
  ...TRAP.map((m) => ({ ...m, cat: 'trap' })),
  ...[...MISSION, ...MORE_MISSION].map((m) => ({ ...m, cat: 'mission' })),
  ...[...MECH, ...MORE_MECH].map((m) => ({ ...m, cat: 'mech' })),
];
