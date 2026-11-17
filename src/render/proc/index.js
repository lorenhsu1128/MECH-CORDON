// 照 GLB 量測重建的程式模型（scripts/glb-to-proc.mjs 產生）：槽位 id → 基本形體清單。
// render/mech-model.js 的 makeProcPiece0 看到這裡有登記的槽位，就用它取代原本手寫的程式模型。
import { cStdPrims } from './c_std.js';

export const PROC_PRIMS = {
  'core/c_std': cStdPrims, // BD-100 GRANITE
};
