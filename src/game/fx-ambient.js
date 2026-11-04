// Game 的 mixin：地圖的持續特效（docs/vfx-design.md 第 4 期）：燃燒的殘骸冒煙與火星、管線的蒸氣、料斗落下的粉塵。
// 地圖建好後從可破壞物件（world.props 的種類）挑幾個點，每格在 renderMain 依特效時鐘的前進量產生顯示卡粒子
// （暫停時特效時鐘不動＝不產生）。只有外觀、各端自己算，不轉送；物件被打壞就停。
import { Game } from './game.js';
import { fxWind, FXU } from '../fx/gpu.js';

// 種類 → 特效（每秒幾次）
const SPOTS = {
  mtwreck: { k: 'burn', rate: 7 },
  pipestack: { k: 'steam', rate: 3 },
  piperun: { k: 'steam', rate: 2 },
  hopper: { k: 'dust', rate: 3 },
};
const MAX_SPOTS = 10;
// 天氣和地面的互動（第 8.5 期）：每秒幾次、離注視點多遠以內（公尺 × 尺度）
const WEATHER_FX = {
  rain: { kind: 'rain', rate: 200, r: 26 },
  sand: { kind: 'band', rate: 55, r: 32, a: 0.4 },
  dust: { kind: 'band', rate: 20, r: 32, a: 0.24 },
  snow: { kind: 'drift', rate: 14, r: 30 },
};
const NEAR = 160; // 離鏡頭多遠以內才產生（公尺 × 尺度）

Object.assign(Game.prototype, {
  // 天氣和地面的互動（docs/vfx-design.md 第 8.5 期，砲火特效「華麗」）：鏡頭注視點附近隨機的位置——
  // 雨＝落地的水花與水面的小波、風沙與塵埃＝貼地流動的沙帶、雪＝貼地吹過的雪煙。依特效時鐘的前進量（暫停時不產生），只有外觀
  fxWeatherTick(dt) {
    const w = this.world,
      fx = this.fx;
    const wk = w.weather && w.weather.kind;
    if (!wk || !fx.rich || !WEATHER_FX[wk]) return;
    const S = WEATHER_FX[wk];
    this.fxwAcc = (this.fxwAcc || 0) + dt * S.rate;
    let n = Math.min(40, Math.floor(this.fxwAcc));
    this.fxwAcc -= Math.floor(this.fxwAcc);
    if (!n) return;
    const c = this.camTarget,
      k = fx.k || 1,
      R = S.r * k;
    const wind = FXU.uWind.value;
    if (S.kind === 'band' && this.fxwCol !== w) {
      this.fxwCol = w;
      this.fxwC = new THREE.Color(w.theme.ground)
        .lerp(new THREE.Color(w.theme.fog), 0.6)
        .lerp(new THREE.Color(0xffffff), 0.25)
        .getHex();
    }
    while (n-- > 0) {
      const a = Math.random() * Math.PI * 2,
        d = Math.sqrt(Math.random()) * R;
      const x = c.x + Math.cos(a) * d,
        z = c.z + Math.sin(a) * d;
      if (w.isVoid && w.isVoid(x, z)) continue;
      const gy = w.terrainHeight(x, z);
      if (S.kind === 'rain') {
        const wet = fx.water && fx.water.wet(x, z);
        fx.rainSplash(x, wet ? fx.water.level : gy, z, wet);
      } else if (S.kind === 'band') fx.sandBand(x, gy, z, wind, this.fxwC, S.a);
      else fx.snowDrift(x, gy, z, wind);
    }
  },
  // 粒子特效共用的風（docs/vfx-design.md 第 8.1 期）：有天氣時沿天氣的風（大約三成、0.6～3.5 m/s），
  // 沒有時依地圖種子決定方向、1.2 m/s；地下（岩頂）幾乎沒有風。只有外觀，各端自己算
  fxWindSet(w) {
    const k = (this.fx && this.fx.k) || 1;
    const T = w.theme || {};
    let x, z, sp;
    const wd = w.weather && w.weather.wind;
    if (wd && (wd[0] || wd[2])) {
      const L = Math.hypot(wd[0], wd[2]);
      x = wd[0] / L;
      z = wd[2] / L;
      sp = Math.min(3.5, Math.max(0.6, L * 0.3));
    } else {
      const a = ((w.seed || 0) * 2.39996) % (Math.PI * 2);
      x = Math.cos(a);
      z = Math.sin(a);
      sp = 1.2;
    }
    if (T.roof) sp = 0.3;
    fxWind(x * sp * k, 0, z * sp * k);
  },
  fxAmbientTick() {
    const w = this.world,
      fx = this.fx;
    if (!w || !fx) return;
    if (this.fxaW !== w) {
      // 換了地圖：重新挑點（照物件的順序，不用亂數）
      this.fxaW = w;
      this.fxWindSet(w);
      this.fxaT = fx.time;
      this.fxa = [];
      for (const p of w.props || []) {
        const S = SPOTS[p.kind];
        if (!S || this.fxa.length >= MAX_SPOTS) continue;
        const ob = p.ob;
        const c = ob.box
          ? ob.box.getCenter(new THREE.Vector3())
          : new THREE.Vector3(ob.x, w.terrainHeight(ob.x, ob.z) + (ob.h || 3) / 2, ob.z);
        const top = ob.box ? ob.box.max.y : c.y + (ob.h || 3) / 2;
        this.fxa.push({ prop: p, k: S.k, rate: S.rate, p: c.setY(top), acc: Math.random() });
      }
      // 地標的特效點（World.addLandmark 換算成世界座標的 userData.fxSpots）
      for (const s of (w.landmark && w.landmark.fx) || [])
        this.fxa.push({ prop: null, k: s.k, rate: s.rate || 6, p: s.p, acc: Math.random() });
    }
    const dt = fx.time - this.fxaT;
    this.fxaT = fx.time;
    if (!(dt > 0) || dt > 0.5) return;
    this.fxWeatherTick(dt);
    if (!this.fxa.length) return;
    const cam = this.camera.position,
      near = NEAR * (fx.k || 1);
    for (const s of this.fxa) {
      if (s.prop && s.prop.dead) continue;
      if (s.p.distanceToSquared(cam) > near * near) continue;
      s.acc += dt * s.rate;
      while (s.acc >= 1) {
        s.acc -= 1;
        fx.ambient(s.k, s.p, s);
      }
    }
  },
});
