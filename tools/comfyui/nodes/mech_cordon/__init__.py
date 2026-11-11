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


NODE_CLASS_MAPPINGS = {"MCAlignPaste": MCAlignPaste, "MCCropSave": MCCropSave}
NODE_DISPLAY_NAME_MAPPINGS = {"MCAlignPaste": "MECH CORDON：對齊並貼回", "MCCropSave": "MECH CORDON：裁切存成 WebP"}
