# MECH CORDON 角色產生器的 ComfyUI 節點（npm run comfy 以 extra_model_paths.yaml 的 custom_nodes 載入）
# - MCAlignPaste：把改過的圖（Qwen-Image-Edit 會整張微微放大、位移）以框外的部分估計仿射變換、對齊回原圖，
#   再只把框內羽化貼回原圖。框外完全是原圖，所以同一張主圖的所有差分身體一定一樣。
import numpy as np
import torch
import cv2


def _np(img):
    return img[0].cpu().numpy().astype(np.float32)


class MCAlignPaste:
    @classmethod
    def INPUT_TYPES(cls):
        i = {"default": 0, "min": 0, "max": 8192}
        return {
            "required": {
                "base": ("IMAGE",),
                "edit": ("IMAGE",),
                "x": ("INT", i),
                "y": ("INT", i),
                "w": ("INT", {**i, "default": 256}),
                "h": ("INT", {**i, "default": 256}),
                "feather": ("INT", {"default": 14, "min": 0, "max": 256}),
                "align": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                # 估計對齊時要排除的範圍（預設＝貼回的框往外 60 px），框內的變化不拿來估計
                "ex": ("INT", {"default": 60, "min": 0, "max": 1024}),
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "aligned")
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, base, edit, x, y, w, h, feather, align, ex=60):
        b = _np(base)
        e = _np(edit)
        H, W = b.shape[:2]
        if e.shape[:2] != (H, W):
            e = cv2.resize(e, (W, H), interpolation=cv2.INTER_LANCZOS4)
        if align:
            g0 = cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
            g1 = cv2.cvtColor(e, cv2.COLOR_RGB2GRAY)
            m = np.full((H, W), 255, np.uint8)
            m[max(0, y - ex) : y + h + ex, max(0, x - ex) : x + w + ex] = 0
            M = np.eye(2, 3, dtype=np.float32)
            try:
                crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
                _, M = cv2.findTransformECC(g0, g1, M, cv2.MOTION_AFFINE, crit, m, 5)
                e = cv2.warpAffine(
                    e, M, (W, H), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE
                )
            except cv2.error as err:
                print("[mech_cordon] 對齊失敗，照原樣貼：", err)
        mask = np.zeros((H, W), np.float32)
        f = feather
        mask[y + f : y + h - f, x + f : x + w - f] = 1
        if f > 0:
            mask = cv2.GaussianBlur(mask, (0, 0), f / 2)
        out = b * (1 - mask[..., None]) + e * mask[..., None]
        t = lambda a: torch.from_numpy(np.clip(a, 0, 1))[None]
        return (t(out), t(e))


class MCCropSave:
    """裁一塊存成 WebP（發佈到遊戲的主圖與臉／眼／嘴小圖），回傳 ComfyUI 的輸出檔，用 /view 取回"""

    @classmethod
    def INPUT_TYPES(cls):
        i = {"default": 0, "min": 0, "max": 8192}
        return {
            "required": {
                "image": ("IMAGE",),
                "x": ("INT", i),
                "y": ("INT", i),
                "w": ("INT", i),  # 0＝整張
                "h": ("INT", i),
                "quality": ("INT", {"default": 88, "min": 1, "max": 100}),
                "name": ("STRING", {"default": "crop"}),
            },
            # 去背的遮罩（1＝保留）：有給時存成有透明的 WebP
            "optional": {"mask": ("MASK",)},
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, image, x, y, w, h, quality, name, mask=None):
        import os
        import re
        from PIL import Image
        import folder_paths

        a = (np.clip(_np(image), 0, 1) * 255).round().astype(np.uint8)
        if mask is not None:
            m = mask[0].cpu().numpy().astype(np.float32)
            if m.shape != a.shape[:2]:
                m = cv2.resize(m, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)
            a = np.dstack([a, (np.clip(m, 0, 1) * 255).round().astype(np.uint8)])
        if w > 0 and h > 0:
            a = a[y : y + h, x : x + w]
        sub = "chargen_pub"
        d = os.path.join(folder_paths.get_output_directory(), sub)
        os.makedirs(d, exist_ok=True)
        fn = re.sub(r"[^a-zA-Z0-9_.-]", "_", name) + ".webp"
        Image.fromarray(a).save(os.path.join(d, fn), "WEBP", quality=quality, method=6)
        return {"ui": {"images": [{"filename": fn, "subfolder": sub, "type": "output"}]}}


def _group_of(tag):
    """See-through 的層 → 立繪的四層：hairb 後髮、body 身體、head 頭（臉、眼、耳、頭飾）、hairf 前髮；None＝不用"""
    import re

    t = tag.lower().replace(" ", "")
    if "hair" in t:
        return "hairb" if ("hairb" in t or "back" in t) else "hairf"
    if t == "head":
        return None  # 整顆頭的大塊（臉的各部分另外有），不用
    # 精確比對（topwear、handwear 這類名稱也含 ear，不能用包含）；左右拆開的層去掉 -l／-r 或結尾的 l／r（eyel、earr）
    t = re.sub(r"[-_](l|r)$", "", t)
    HEAD = {"headwear", "face", "irides", "eyebrow", "eyewhite", "eyelash", "eyewear", "ears", "earwear", "nose", "mouth"}
    HEAD |= {"eyes", "eye", "eyel", "eyer", "earl", "earr", "ear"}
    return "head" if t in HEAD else "body"


GROUPS = ("hairb", "body", "head", "hairf")


class MCLayerGroups:
    """See-through 拆出來的層（SEETHROUGH_PARTS）合併成四層、換算回原圖的座標，存成有透明的 WebP（docs/portrait-design.md 第 6 期）。
    看得到的像素一律用原圖的顏色（每個像素歸最上面那一層），只有被遮住的地方用 See-through 補畫的內容，
    所以四層照順序疊起來＝原圖，臉／眼／嘴的差分小圖也對得上。去背的遮罩外面一律透明。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "parts": ("SEETHROUGH_PARTS",),
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "quality": ("INT", {"default": 88, "min": 1, "max": 100}),
                "name": ("STRING", {"default": "layer"}),
            }
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, parts, image, mask, quality, name):
        import os
        import re
        from PIL import Image
        import folder_paths

        src = (np.clip(_np(image), 0, 1) * 255).round().astype(np.uint8)  # 原圖 RGB
        H, W = src.shape[:2]
        fg = mask[0].cpu().numpy().astype(np.float32)
        if fg.shape != (H, W):
            fg = cv2.resize(fg, (W, H), interpolation=cv2.INTER_LINEAR)
        tag2 = parts["tag2pinfo"]
        R = int(parts["frame_size"][0])  # See-through 的畫面：原圖置中補成 S×S 正方形、縮放到 R×R
        S = max(W, H)
        px, py = (S - W) // 2, (S - H) // 2
        # 每一組依深度（遠 → 近）疊成 R×R 的 RGBA
        acc = {g: np.zeros((R, R, 4), np.float32) for g in GROUPS}
        for tag in sorted(tag2, key=lambda t: tag2[t].get("depth_median", 1), reverse=True):
            g = _group_of(tag)
            pi = tag2[tag]
            img = pi.get("img")
            if g is None or img is None:
                continue
            x1, y1 = [int(v) for v in pi.get("xyxy", [0, 0])[:2]]
            a = img.astype(np.float32) / 255
            h, w = a.shape[:2]
            h, w = min(h, R - y1), min(w, R - x1)
            if h <= 0 or w <= 0:
                continue
            a = a[:h, :w]
            dst = acc[g][y1 : y1 + h, x1 : x1 + w]
            al = a[..., 3:4]
            dst[..., :3] = a[..., :3] * al + dst[..., :3] * (1 - al)
            dst[..., 3:4] = al + dst[..., 3:4] * (1 - al)
        # R×R → 原圖的座標
        lay = {}
        for g in GROUPS:
            # 疊的時候顏色是預乘的：縮放之後再除回透明度
            big = cv2.resize(acc[g], (S, S), interpolation=cv2.INTER_LINEAR)[py : py + H, px : px + W]
            big[..., :3] /= np.maximum(big[..., 3:4], 1e-4)
            lay[g] = big
        # 看得到的像素歸最上面那一層（前髮 > 頭 > 身體 > 後髮），在去背的範圍內
        owner = np.full((H, W), -1, np.int8)
        for i, g in enumerate(GROUPS):
            owner[(lay[g][..., 3] > 0.5) & (fg > 0.5)] = i
        # 去背的範圍內沒有任何一層（See-through 漏掉的）：給身體
        owner[(owner < 0) & (fg > 0.5)] = GROUPS.index("body")
        sub = "chargen_pub"
        d = os.path.join(folder_paths.get_output_directory(), sub)
        os.makedirs(d, exist_ok=True)
        out = []
        for i, g in enumerate(GROUPS):
            L = lay[g]
            mine = owner == i
            rgb = np.where(mine[..., None], src.astype(np.float32) / 255, L[..., :3])
            # 自己看得到的＝去背的遮罩；被別層蓋住的＝補畫的透明度，但不超出輪廓（不動的時候疊起來＝原圖）
            al = np.where(mine, fg, np.minimum(L[..., 3], fg))
            a = np.dstack([rgb, al])
            a = (np.clip(a, 0, 1) * 255).round().astype(np.uint8)
            fn = re.sub(r"[^a-zA-Z0-9_.-]", "_", f"{name}_{g}") + ".webp"
            Image.fromarray(a, "RGBA").save(os.path.join(d, fn), "WEBP", quality=quality, method=6)
            out.append({"filename": fn, "subfolder": sub, "type": "output"})
        return {"ui": {"images": out}}


class MCPatchPaste:
    """局部改圖貼回（2026-11-15 立繪大修）：edit 是 base 的 [x, y, w, h] 那一塊放大後改過的圖。
    縮回原尺寸 → 以 inner 以外的部分估計仿射變換並校正整體的色偏 → 只把 inner 裡「真的改了」的像素
    （差異超過 thr、去掉小雜點、往外長 grow px、羽化 feather px）貼回。所以眉毛、頭髮這些沒改的地方
    完全是原圖，不會出現整個框半透明疊在一起的殘影。回傳貼好的整張圖與遮罩。"""

    @classmethod
    def INPUT_TYPES(cls):
        i = {"default": 0, "min": 0, "max": 8192}
        return {
            "required": {
                "base": ("IMAGE",),
                "edit": ("IMAGE",),
                "x": ("INT", i),
                "y": ("INT", i),
                "w": ("INT", {**i, "default": 256}),
                "h": ("INT", {**i, "default": 256}),
                "ix": ("INT", i),
                "iy": ("INT", i),
                "iw": ("INT", {**i, "default": 64}),
                "ih": ("INT", {**i, "default": 64}),
                "thr": ("FLOAT", {"default": 0.07, "min": 0.0, "max": 1.0, "step": 0.005}),
                "grow": ("INT", {"default": 3, "min": 0, "max": 64}),
                "feather": ("INT", {"default": 2, "min": 0, "max": 64}),
                "align": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "keep_frac": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01}),
                "thr_hi": ("FLOAT", {"default": 0.22, "min": 0.0, "max": 1.0, "step": 0.01}),
                "no_blush": ("BOOLEAN", {"default": True}),
                "hyst_r": ("INT", {"default": 8, "min": 0, "max": 64}),
                "protect_edges": ("BOOLEAN", {"default": False}),
                "exclude": ("STRING", {"default": ""}),
                "no_recolor": ("BOOLEAN", {"default": False}),
                "keep_tone": ("BOOLEAN", {"default": False}),
                "tone_fix": ("BOOLEAN", {"default": False}),
                "skin_box": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, base, edit, x, y, w, h, ix, iy, iw, ih, thr, grow, feather, align, keep_frac=0.2, thr_hi=0.22, no_blush=True, hyst_r=8, protect_edges=False, exclude='', no_recolor=False, tone_fix=False, keep_tone=False, skin_box=''):
        B = _np(base)
        H, W = B.shape[:2]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + w), min(H, y + h)
        b = B[y0:y1, x0:x1]
        ch, cw = b.shape[:2]
        e = cv2.resize(_np(edit), (cw, ch), interpolation=cv2.INTER_AREA)
        # inner（裁切區的座標）
        jx0, jy0 = max(0, ix - x0), max(0, iy - y0)
        jx1, jy1 = min(cw, ix + iw - x0), min(ch, iy + ih - y0)
        outside = np.full((ch, cw), 255, np.uint8)
        m8 = 10
        outside[max(0, jy0 - m8) : jy1 + m8, max(0, jx0 - m8) : jx1 + m8] = 0
        if align:
            g0 = cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
            g1 = cv2.cvtColor(e, cv2.COLOR_RGB2GRAY)
            M = np.eye(2, 3, dtype=np.float32)
            try:
                crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
                _, M = cv2.findTransformECC(g0, g1, M, cv2.MOTION_AFFINE, crit, outside, 5)
                e = cv2.warpAffine(
                    e, M, (cw, ch), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE
                )
            except cv2.error as err:
                print("[mech_cordon] 對齊失敗，照原樣貼：", err)
        # 整體色偏：框外的平均與標準差對齊原圖
        o = outside > 0
        if o.sum() > 100:
            for c in range(3):
                mb, sb = b[..., c][o].mean(), b[..., c][o].std() + 1e-4
                me, se = e[..., c][o].mean(), e[..., c][o].std() + 1e-4
                e[..., c] = (e[..., c] - me) * (sb / se) + mb
            e = np.clip(e, 0, 1)
        d = np.abs(e - b).max(-1)
        m = (d > thr).astype(np.uint8)
        # 遲滯：只留「強烈改變（線條、虹膜，> thr_hi）附近 8 px 以內」的弱改變。Qwen 順手加的腮紅、陰影是大片的弱改變，不貼
        # 「強烈」看亮度的變化（線條、虹膜、閉眼的眼線都是亮度大變；腮紅主要是顏色變）
        Y = lambda a: a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
        dY = np.abs(Y(e) - Y(b))
        core = (dY > thr_hi).astype(np.uint8)
        # 只是變紅（腮紅）、亮度沒什麼變的像素不貼
        blush = ((e[..., 0] - e[..., 1]) - (b[..., 0] - b[..., 1]) > 0.06) & (dY < 0.12)
        if no_blush:
            m &= (~blush).astype(np.uint8)
        m &= cv2.dilate(core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (hyst_r * 2 + 1, hyst_r * 2 + 1)))
        inner = np.zeros((ch, cw), np.uint8)
        inner[jy0:jy1, jx0:jx1] = 1
        # exclude＝「x,y,w,h;…」整張圖的座標：一律不貼、邊緣淡出（角色臉上的固定記號，例如 VOLTA 的 OK 繃：
        # 寫進指示 Qwen 會把它重畫得更大更深，2026-11-16）
        for r in [t for t in (exclude or '').split(';') if t.strip()]:
            ex_, ey_, ew_, eh_ = [int(float(v)) for v in r.split(',')]
            inner[max(0, ey_ - y0) : max(0, ey_ + eh_ - y0), max(0, ex_ - x0) : max(0, ex_ + ew_ - x0)] = 0
        m *= inner
        if protect_edges:
            # 穿過範圍邊界的深色長線（下巴與臉的輪廓、麥克風桿、頭髮的邊）是框外延伸進來的東西，不是眼睛嘴巴：
            # 不貼（Qwen 常把下巴線畫粗、把麥克風擦掉，2026-11-16 ECHO 的品管）
            Yb = b[..., 0] * 0.299 + b[..., 1] * 0.587 + b[..., 2] * 0.114
            # 線條＝比周圍皮膚暗一截的像素（鼻子的線是淡褐色，不是黑的；2026-11-16 ECHO 的鼻線被畫黑）
            skin = float(np.median(Yb[inner > 0]))
            dark = ((Yb < skin - 0.12) & (inner > 0)).astype(np.uint8)
            nl, lab, st, _ = cv2.connectedComponentsWithStats(dark, 8)
            edge = set(np.unique(np.concatenate([lab[jy0, jx0:jx1], lab[jy1 - 1, jx0:jx1], lab[jy0:jy1, jx0], lab[jy0:jy1, jx1 - 1]]))) - {0}
            # 另外：不碰到範圍中央（中間 50%×50%，嘴巴本身在那裡）的深色線條也保護——鼻尖的線、下巴線、麥克風桿
            # 在嘴巴框裡但不是嘴（2026-11-16 ECHO：嘴型把鼻子的線畫黑）
            cy0, cy1 = jy0 + (jy1 - jy0) // 4, jy1 - (jy1 - jy0) // 4
            cx0, cx1 = jx0 + (jx1 - jx0) // 4, jx1 - (jx1 - jx0) // 4
            center = set(np.unique(lab[cy0:cy1, cx0:cx1])) - {0}
            for i in range(1, nl):
                if i not in center:
                    edge.add(i)
            if edge:
                prot = np.isin(lab, list(edge)).astype(np.uint8)
                prot = cv2.dilate(prot, np.ones((5, 5), np.uint8))
                m &= (1 - prot).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        keep = np.zeros(n, np.uint8)
        keep[1:] = st[1:, cv2.CC_STAT_AREA] >= 12
        m = keep[lab]
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        # 只留主要的改變（眼睛、嘴巴）：比最大的一塊小很多的（Qwen 順手擦掉的皺紋、陰影）不貼
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        if n > 2:
            area = st[1:, cv2.CC_STAT_AREA]
            keep = np.zeros(n, np.uint8)
            keep[1:] = area >= area.max() * keep_frac
            m = keep[lab]
        if grow > 0:
            m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow * 2 + 1, grow * 2 + 1)))
        mf = m.astype(np.float32) * inner
        if feather > 0:
            mf = cv2.GaussianBlur(mf, (0, 0), feather)
            # 碰到 inner 的邊緣時往內淡出，邊上一定是原圖
            dist = cv2.distanceTransform(inner, cv2.DIST_L2, 3)
            mf *= np.clip(dist / (feather * 2 + 1), 0, 1)
        if no_recolor:
            # 眨眼只該改眼皮的線條：新圖的亮度＋原圖的顏色（Qwen 會把虹膜換色，2026-11-16 教官的灰眼變藍、綠、橘）；
            # 顏色接近皮膚的像素（蓋下來的眼皮）照新圖
            Yc = lambda a: (a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114)[..., None]
            cB, cE = b - Yc(b), e - Yc(e)
            # 皮膚＝框裡新舊圖幾乎一樣、又不是很暗的像素（以前只取亮度 0.6 以上，深色皮膚的 UNDERTOW 找不到皮膚，整段都沒作用）
            same = (np.abs(Yc(e) - Yc(b))[..., 0] < 0.02) & (Yc(b)[..., 0] > 0.18) & (inner > 0)
            satb = b.max(axis=2) - b.min(axis=2)
            # 皮膚一律偏暖（紅 > 藍）：皮膚接近純白的 MARSH 框裡「不變的像素」只剩青色頭髮，膚色被估成頭髮色、
            # 眼白補色把整圈皮膚塗成青色（2026-11-16 21:10 那批）；找不到暖色的皮膚時整段不做
            warm = b[..., 0] > b[..., 2] + 0.02
            lit = same & (satb > 0.04) & (Yc(b)[..., 0] < 0.97) & warm
            skC = None
            if skin_box:
                # 膚色＝臉框（整張圖的座標）裡出現最多的顏色：眼睛框裡頭髮多的角色（WREN 的粉紅瀏海）從「沒變的像素」估會估成頭髮色，
                # 舊的高光與眼白被補成頭髮色、留下舊眼睛的粉紅殘影（2026-11-16 21:00 那批）
                fx_, fy_, fw_, fh_ = [int(float(v)) for v in skin_box.split(',')]
                F = B[max(0, fy_) : fy_ + fh_, max(0, fx_) : fx_ + fw_].reshape(-1, 3)
                F = F[(F @ np.array([0.299, 0.587, 0.114])) > 0.15]
                # 只取偏暖的顏色（紅 > 藍）：臉框裡頭盔、頭髮比皮膚多時（雜兵 2 的灰頭盔）眼白會被補成頭盔色
                Fw = F[F[:, 0] > F[:, 2] + 0.02]
                # 偏暖的要佔四分之一以上才換（皮膚接近純白的 MARSH 沒有暖色皮膚，換了會挑到嘴巴的紅）
                if len(Fw) > max(200, len(F) // 4):
                    F = Fw
                if len(F) > 200:
                    q = np.clip((F * 15.99).astype(np.int32), 0, 15)
                    key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
                    top = np.bincount(key).argmax()
                    sel = F[key == top]
                    skC = np.median(sel, axis=0)
                    skY = float(skC @ np.array([0.299, 0.587, 0.114]))
                    sk = skC - skY
            elif lit.sum() > 50:
                sk = np.median(cB[lit], axis=0)
                skY = float(np.median(Yc(b)[lit]))
                skC = np.median(b[lit], axis=0)
            if skC is not None:
                # 原本是眼白、新圖不是眼線的地方補成皮膚色（閉眼後原本眼白的位置留下白色、灰色的糊塊，2026-11-16 UNDERTOW、MARSH 等）
                # 範圍：貼回範圍往外 15 px（Qwen 閉眼時常常沒動到舊眼白，那裡不在「有改變」的範圍裡，閉眼上留下白圈，
                # 2026-11-17 雜兵）；只取不碰到眼睛框邊的連通塊（背景的白色碰得到邊，不能補成皮膚）
                near = cv2.dilate((mf > 0.05).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
                sclera = (Yc(b)[..., 0] > 0.8) & (satb < 0.09) & (Yc(b)[..., 0] > skY + 0.08) & near & (inner > 0)
                n_, lab_ = cv2.connectedComponents(sclera.astype(np.uint8), connectivity=8)
                li_ = lab_[jy0:jy1, jx0:jx1]
                edge_ = set(np.unique(np.concatenate([li_[0], li_[-1], li_[:, 0], li_[:, -1]]))) - {0}
                for k_ in edge_:
                    sclera[lab_ == k_] = False
                notline = Yc(e)[..., 0] > skY - 0.15
                fillm = (sclera & notline)
                if fillm.any():
                    e = np.where(fillm[..., None], skC[None, None, :], e)
                    fm_ = cv2.GaussianBlur(fillm.astype(np.float32), (0, 0), 1.2)
                    mf = np.maximum(mf, np.clip(fm_ * 1.5, 0, 1) * (inner > 0))
                skin = np.abs(cE - sk).max(axis=2) < 0.04
                # 原圖是眼白（很亮）或線條（很暗）的地方換上虹膜時照新圖（虹膜往下移，否則變成灰色，2026-11-16 RUST）
                # 下限 0.1：深色的虹膜（SPECIMEN 的黑眼）也要保護，只有眼線那種近黑的才照新圖
                mid = (Yc(b)[..., 0] > 0.1) & (Yc(b)[..., 0] < 0.82)
                # 只有新圖比原圖更鮮豔的像素（灰眼被畫成藍眼）才換回原圖的顏色；新圖比原圖淡的（虹膜被眼皮蓋住）照新圖，
                # 否則淡色皮膚會染上虹膜的顏色（2026-11-16 SIROCCO 的金眼）
                sat = lambda a: a.max(axis=2) - a.min(axis=2)
                more = sat(e) > sat(b) + 0.04
                # keep_tone：臉上有大片的疤或刺青蓋過眼睛（KILN 的燙傷疤），蓋下來的眼皮也照原圖的顏色，否則疤會被補成一般膚色
                keep = (~mid) if keep_tone else (skin | ~mid | ~more)
                e = np.where(keep[..., None], e, np.clip(Yc(e) + cB, 0, 1))
        if tone_fix and mf.max() > 0:
            # 貼上的範圍裡新補的皮膚和周圍原圖差一點點亮度，邊界會看得出一個框（大嘴縮小時，2026-11-16 教官、霍斯特、諾拉）：
            # 量貼上範圍內緣一圈「新圖」與外緣一圈「原圖」的顏色差（只取亮的皮膚、兩邊都平坦的像素），整塊新圖補上這個差
            hard = (mf > 0.5).astype(np.uint8)
            k9 = np.ones((9, 9), np.uint8)
            ring_in = hard - cv2.erode(hard, k9)
            ring_out = cv2.dilate(hard, k9) - hard
            Yb2 = b[..., 0] * 0.299 + b[..., 1] * 0.587 + b[..., 2] * 0.114
            Ye2 = e[..., 0] * 0.299 + e[..., 1] * 0.587 + e[..., 2] * 0.114
            si = (ring_in > 0) & (Ye2 > 0.55)
            # 外圈不限在 inner 裡：大嘴縮小時整個 inner 都會被貼上，外圈落在 inner 外（以前這裡量不到、修正沒作用）
            so = (ring_out > 0) & (Yb2 > 0.55)
            if si.sum() > 30 and so.sum() > 30:
                off = np.median(b[so], axis=0) - np.median(e[si], axis=0)
                if np.abs(off).max() < 0.08:
                    lite = (Ye2 > 0.55)[..., None]
                    e = np.where(lite, np.clip(e + off, 0, 1), e)
        out = B.copy()
        out[y0:y1, x0:x1] = b * (1 - mf[..., None]) + e * mf[..., None]
        full = np.zeros((H, W), np.float32)
        full[y0:y1, x0:x1] = mf
        return (torch.from_numpy(np.clip(out, 0, 1))[None], torch.from_numpy(full)[None])


class MCGlassesOver:
    """戴眼鏡角色的眨眼（2026-11-16）：edit＝在「拿掉眼鏡的圖 nog」上閉眼的結果；
    鏡框＝base 和 nog 差很多、而且 base 比較暗的地方（框 [x, y, w, h] 內），把 base 的鏡框疊回 edit。"""

    @classmethod
    def INPUT_TYPES(cls):
        i = {"default": 0, "min": 0, "max": 8192}
        return {
            "required": {
                "base": ("IMAGE",),
                "nog": ("IMAGE",),
                "edit": ("IMAGE",),
                "x": ("INT", i),
                "y": ("INT", i),
                "w": ("INT", {**i, "default": 256}),
                "h": ("INT", {**i, "default": 256}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, base, nog, edit, x, y, w, h):
        b, n, e = _np(base), _np(nog), _np(edit)
        H, W = b.shape[:2]
        Y = lambda a: a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
        d = np.abs(b - n).max(-1)
        g = ((d > 0.1) & (Y(b) < Y(n) - 0.04)).astype(np.uint8)
        reg = np.zeros((H, W), np.uint8)
        reg[max(0, y) : y + h, max(0, x) : x + w] = 1
        g *= reg
        g = cv2.morphologyEx(g, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        nl, lab, st, _ = cv2.connectedComponentsWithStats(g, 8)
        keep = np.zeros(nl, np.uint8)
        keep[1:] = st[1:, cv2.CC_STAT_AREA] >= 20
        g = keep[lab]
        g = cv2.dilate(g, np.ones((3, 3), np.uint8)).astype(np.float32)
        g = cv2.GaussianBlur(g, (0, 0), 0.7)
        out = e * (1 - g[..., None]) + b * g[..., None]
        return (torch.from_numpy(np.clip(out, 0, 1))[None], torch.from_numpy(g)[None])


NODE_CLASS_MAPPINGS = {
    "MCGlassesOver": MCGlassesOver,
    "MCAlignPaste": MCAlignPaste,
    "MCPatchPaste": MCPatchPaste,
    "MCCropSave": MCCropSave,
    "MCLayerGroups": MCLayerGroups,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MCAlignPaste": "MECH CORDON：對齊並貼回",
    "MCPatchPaste": "MECH CORDON：局部改圖貼回（只貼有改的像素）",
    "MCCropSave": "MECH CORDON：裁切存成 WebP",
    "MCLayerGroups": "MECH CORDON：分層合併成四層",
}
