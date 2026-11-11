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


NODE_CLASS_MAPPINGS = {"MCAlignPaste": MCAlignPaste, "MCCropSave": MCCropSave, "MCLayerGroups": MCLayerGroups}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MCAlignPaste": "MECH CORDON：對齊並貼回",
    "MCCropSave": "MECH CORDON：裁切存成 WebP",
    "MCLayerGroups": "MECH CORDON：分層合併成四層",
}
