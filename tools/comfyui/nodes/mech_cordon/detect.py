# 立繪工房的自動標框（docs/portrait-studio-design.md 第 4 期）：
# - MCFaceBoxes：動漫的臉與眼睛偵測（deepghs 的 YOLO ONNX：anime_face_detection face_detect_v1.4_s（MIT）、
#   anime_eye_detection eye_detect_v1.0_s（OpenRAIL）），第一次用到時從 Hugging Face 下載到 models/mc_detect/。
#   臉框與眼睛框照現有 29 個角色、133 個姿勢手標的框校準（2026-11-18：和手標的重疊度中位數 臉 0.78、眼睛 0.76）：
#     臉＝偵測框的 左 7%、上 13%、右 93%、下 95%
#     眼睛＝兩隻眼睛的聯集往外：左右各 0.23／0.22 個聯集寬、往上 0.94 個單眼高（眉毛）、往下 0.62 個單眼高
#   只找到一隻或沒找到眼睛時用臉框的比例。
# - MCGreenBox：嘴巴的位置。用影像規則找嘴的線條不可靠（133 個裡只對 72 個），所以讓 Qwen 把嘴唇塗成純綠色，
#   這裡比對塗之前與之後，找最大的那一塊綠色。
# 兩個都輸出 ui.text（JSON 字串），立繪工房從 /history 讀。
import json
import os

import numpy as np

_SESS = {}
_MODELS = {
    "face": ("deepghs/anime_face_detection", "face_detect_v1.4_s"),
    "eye": ("deepghs/anime_eye_detection", "eye_detect_v1.0_s"),
}


def _sess(k):
    if k not in _SESS:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        import folder_paths

        repo, name = _MODELS[k]
        d = os.path.join(folder_paths.models_dir, "mc_detect")
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, name, "model.onnx")
        if not os.path.exists(p):  # 本機有就不再連 Hugging Face（離線也能用）
            p = hf_hub_download(repo, f"{name}/model.onnx", local_dir=d)
        # CPU 就夠快（一張圖不到 1 秒）；CUDA 版要對得上的 cuDNN／CUDA，開不起來時每次都印一堆警告
        _SESS[k] = ort.InferenceSession(p, providers=["CPUExecutionProvider"])
    return _SESS[k]


def _detect(sess, a, conf, size=640):
    """a：H×W×3 的 0～1；回傳 [(分數, [x0, y0, x1, y1])…]（NMS 之後）"""
    import cv2

    H, W = a.shape[:2]
    r = size / max(W, H)
    nw, nh = int(round(W * r)), int(round(H * r))
    can = np.full((size, size, 3), 114 / 255, np.float32)
    can[:nh, :nw] = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_LINEAR)
    x = can.transpose(2, 0, 1)[None].astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    boxes = out[:4].T
    sc = out[4:].max(0)
    keep = sc > conf
    boxes, sc = boxes[keep], sc[keep]
    xyxy = np.stack([boxes[:, 0] - boxes[:, 2] / 2, boxes[:, 1] - boxes[:, 3] / 2, boxes[:, 0] + boxes[:, 2] / 2, boxes[:, 1] + boxes[:, 3] / 2], 1) / r
    res = []
    for i in np.argsort(-sc):
        b = xyxy[i]
        ok = True
        for _, c in res:
            ix = max(0, min(b[2], c[2]) - max(b[0], c[0]))
            iy = max(0, min(b[3], c[3]) - max(b[1], c[1]))
            inter = ix * iy
            u = (b[2] - b[0]) * (b[3] - b[1]) + (c[2] - c[0]) * (c[3] - c[1]) - inter
            if inter / max(u, 1e-6) > 0.5:
                ok = False
                break
        if ok:
            res.append((float(sc[i]), [float(v) for v in b]))
    return res


def face_boxes(a):
    """a：H×W×3（0～1）→ { face, eyes, eyeN, score }（x, y, w, h；沒找到臉＝{}）"""
    H, W = a.shape[:2]
    faces = _detect(_sess("face"), a, 0.3)
    if not faces:
        return {}
    # 最大的臉（立繪只有一個人；背景偶爾有小的誤判）
    s, f = max(faces, key=lambda d: (d[1][2] - d[1][0]) * (d[1][3] - d[1][1]) * (0.5 + d[0]))
    fw, fh = f[2] - f[0], f[3] - f[1]
    face = [f[0] + 0.07 * fw, f[1] + 0.13 * fh, f[0] + 0.93 * fw, f[1] + 0.95 * fh]
    eyes = [d[1] for d in _detect(_sess("eye"), a, 0.25) if d[1][0] < f[2] and d[1][2] > f[0] and d[1][1] < f[3] and d[1][3] > f[1]]
    eyes = sorted(eyes, key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))[:2]
    if len(eyes) == 2:
        u = [min(b[0] for b in eyes), min(b[1] for b in eyes), max(b[2] for b in eyes), max(b[3] for b in eyes)]
        # 上下留的量乘「單隻眼睛的平均高度」：頭歪的時候兩眼高低不同，聯集變高，乘聯集的高度會把框撐得比臉還大
        # （頭正的時候兩者一樣，係數照 133 個姿勢的校準）
        w = u[2] - u[0]
        h = sum(b[3] - b[1] for b in eyes) / 2
        eb = [u[0] - 0.23 * w, u[1] - 0.94 * h, u[2] + 0.22 * w, u[3] + 0.62 * h]
    else:
        eb = [f[0] + 0.01 * fw, f[1] + 0.14 * fh, f[0] + 0.95 * fw, f[1] + 0.61 * fh]

    def xywh(b):
        x0, y0 = max(0, b[0]), max(0, b[1])
        x1, y1 = min(W, b[2]), min(H, b[3])
        return [int(round(x0)), int(round(y0)), int(round(x1 - x0)), int(round(y1 - y0))]

    return {"face": xywh(face), "eyes": xywh(eb), "eyeN": len(eyes), "score": round(s, 3), "faceDet": xywh(f)}


class MCFaceBoxes:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",)}}

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, image):
        a = image[0].cpu().numpy().astype(np.float32)[..., :3]
        return {"ui": {"text": [json.dumps(face_boxes(a))]}}


class MCGreenBox:
    """base：塗之前的裁切（原尺寸）；edit：Qwen 塗過的（任何大小）；x、y＝裁切在整張圖裡的位置
    回傳嘴（綠色最大的一塊）在整張圖的 x, y, w, h 與綠色的像素數"""

    @classmethod
    def INPUT_TYPES(cls):
        i = {"default": 0, "min": 0, "max": 8192}
        return {"required": {"base": ("IMAGE",), "edit": ("IMAGE",), "x": ("INT", i), "y": ("INT", i)}}

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "mech_cordon"

    def run(self, base, edit, x, y):
        import cv2

        b = base[0].cpu().numpy().astype(np.float32)[..., :3]
        e = edit[0].cpu().numpy().astype(np.float32)[..., :3]
        H, W = b.shape[:2]
        e = cv2.resize(e, (W, H), interpolation=cv2.INTER_AREA)

        def green(a):
            return (a[..., 1] > 0.55) & (a[..., 0] < 0.45) & (a[..., 2] < 0.45) & (a[..., 1] - np.maximum(a[..., 0], a[..., 2]) > 0.3)

        g = (green(e) & ~green(b)).astype(np.uint8)
        g = cv2.morphologyEx(g, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(g, 8)
        res = {}
        if n > 1:
            i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            bx, by, bw, bh, area = [int(v) for v in st[i]]
            if area >= 20:
                res = {"mouth": [x + bx, y + by, bw, bh], "px": area}
        return {"ui": {"text": [json.dumps(res)]}}


NODE_CLASS_MAPPINGS = {"MCFaceBoxes": MCFaceBoxes, "MCGreenBox": MCGreenBox}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MCFaceBoxes": "MECH CORDON：動漫的臉與眼睛框",
    "MCGreenBox": "MECH CORDON：找塗成綠色的地方（嘴）",
}
