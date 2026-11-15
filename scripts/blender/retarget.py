# 過場人物的動作：在 Blender 裡把 Universal Animation Library 的動作對應到現有人物的骨架（scripts/people-retarget.js 呼叫）。
# 參數（-- 之後一個 JSON）：{ target, sources: [...], clips: [[來源動作, 遊戲的名稱]...], map: {來源骨頭: 目標骨頭}, out }
# 做法（每一格、目標骨頭由父到子）：
#   旋轉＝來源骨頭的世界旋轉相對於它 T 姿勢的變化 Δ（Rs·Rs0⁻¹）套到目標骨頭的 T 姿勢（綁定姿勢＝Blender 的靜止姿勢）；
#   位置＝照父骨頭（腳掌 Foot.L/R 是 IK 的控制點、掛在根部：改照小腿末端）；骨盆照來源的位移×腿長的比例；
#   沒有對應的骨頭（Body、極向控制點、指尖…）＝靜止姿勢。根骨頭以外每根骨頭每一格都寫關鍵格（原檔的預設姿勢不是 T 姿勢）。
# 輸出只有骨架＋新動作的 GLB（骨頭的局部座標和原本的人物 GLB 相同，往返測試過），遊戲裡同骨架的人物共用。
import bpy, sys, json
from mathutils import Matrix, Vector

A = json.loads(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30


def imp(f):
    objs, acts = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=f)
    arm = [o for o in bpy.data.objects if o not in objs and o.type == 'ARMATURE'][0]
    return arm, [a for a in bpy.data.actions if a not in acts]


def use_action(obj, act):
    ad = obj.animation_data or obj.animation_data_create()
    ad.action = act
    if hasattr(ad, 'action_slot') and act.slots and ad.action_slot is None:
        ad.action_slot = act.slots[0]


T, tacts = imp(A['target'])
srcs = [imp(f) for f in A['sources']]
MAP = A['map']
INV = {v: k for k, v in MAP.items()}
FOOT = {'Foot.L': 'LowerLeg.L', 'Foot.R': 'LowerLeg.R'}  # IK 的腳掌：位置照小腿末端

# 目標：靜止姿勢（＝綁定的 T 姿勢）、世界的旋轉與縮放
if T.animation_data:
    T.animation_data.action = None
for pb in T.pose.bones:
    pb.matrix_basis = Matrix()
    pb.rotation_mode = 'QUATERNION'
bpy.context.view_layer.update()
A0 = {b.name: b.matrix_local.copy() for b in T.data.bones}
MW = T.matrix_world.copy()
Rarm = MW.to_3x3().normalized().to_quaternion()
MWi3 = MW.inverted().to_3x3()
order = []


def walk(b):
    order.append(b)
    for c in b.children:
        walk(c)


for b in T.data.bones:
    if not b.parent:
        walk(b)
tw = lambda n: MW @ A0[n].translation
t_hip_h = tw('Hips').z - min(tw('Foot.L').z, tw('Foot.R').z)

def fcurves(act):
    # Blender 4.4 起動作分層（layers → strips → channelbags）
    if hasattr(act, 'layers') and act.layers:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    else:
        yield from act.fcurves


def slim(act):
    # 線性插值（匯出成 LINEAR，不是三倍資料的 CUBICSPLINE）；整條都一樣的只留一格
    for fc in fcurves(act):
        kps = fc.keyframe_points
        for k in kps:
            k.interpolation = 'LINEAR'
        if len(kps) > 1 and max(k.co[1] for k in kps) - min(k.co[1] for k in kps) < 1e-5:
            while len(kps) > 1:
                kps.remove(kps[len(kps) - 1])



ARM_IK = A.get('armIk', True)
# 只修正雙手會在胸前交疊的動作（推、招手之類照抄角度比較自然）
IK_CLIPS = {'Talk', 'Carry', 'SitTalk'}
SUB = {}  # 每根骨頭的子孫（含自己）


def subtree(n):
    if n not in SUB:
        b = T.data.bones[n]
        SUB[n] = [n] + [c.name for c in b.children_recursive]
    return SUB[n]


def rot_about(P, names, pivot, q):
    R = Matrix.Translation(pivot) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pivot)
    for m in names:
        P[m] = R @ P[m]


def fix_arms(S, SW, P):
    sb = S.pose.bones
    if 'spine_03' not in sb or 'Chest' not in P:
        return
    chest_s = SW @ sb['spine_03'].head
    for sd, td in (('l', 'L'), ('r', 'R')):
        ua, la, wr = 'UpperArm.' + td, 'LowerArm.' + td, 'Wrist.' + td
        if ua not in P or la not in P or wr not in P:
            continue
        L1 = (A0[la].translation - A0[ua].translation).length
        L2 = (A0[wr].translation - A0[la].translation).length
        sh = P[ua].translation.copy()
        want = P['Chest'].translation + MWi3 @ ((SW @ sb['hand_' + sd].head - chest_s) * ratio)
        v = want - sh
        dist = max(1e-4, min(v.length, (L1 + L2) * 0.999))
        dirv = v.normalized()
        t = sh + dirv * dist
        # 手肘方向：來源的手肘相對於肩→手連線的垂直分量
        es = SW @ sb['lowerarm_' + sd].head
        ss = SW @ sb['upperarm_' + sd].head
        hs = SW @ sb['hand_' + sd].head
        pole = MWi3 @ (es - (ss + (hs - ss) * ((es - ss).dot(hs - ss) / max(1e-6, (hs - ss).length_squared))))
        pole = pole - dirv * pole.dot(dirv)
        if pole.length < 1e-5:
            continue
        pole.normalize()
        a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
        h = max(0.0, L1 * L1 - a * a) ** 0.5
        elbow = sh + dirv * a + pole * h
        # 上臂：肩為中心，把目前的手肘轉到新的手肘
        cur_e = P[la].translation - sh
        q1 = cur_e.rotation_difference(elbow - sh)
        rot_about(P, subtree(ua), sh, q1)
        # 前臂：手肘為中心，把目前的手腕轉到目標
        e2 = P[la].translation.copy()
        q2 = (P[wr].translation - e2).rotation_difference(t - e2)
        rot_about(P, subtree(la), e2, q2)


out_actions = []
for S, sacts in srcs:
    # glTF 匯入的動作名稱可能帶物件名稱的後綴：去掉
    # （兩包的動作同名時 Blender 會加 .001：也去掉）
    import re

    names = {}
    for a in sacts:
        n = re.sub(r'[.]\d{3}$', '', a.name)
        for suf in ('_' + S.name, '|' + S.name):
            if n.endswith(suf):
                n = n[: -len(suf)]
        names[n] = a
    tpose = names.get('A_TPose')
    if not tpose:
        continue
    use_action(S, tpose)
    sc.frame_set(int(tpose.frame_range[0]))
    SW = S.matrix_world
    rs0 = {n: (SW @ S.pose.bones[n].matrix).to_3x3().normalized().to_quaternion() for n in MAP if n in S.pose.bones}
    sp0 = SW @ S.pose.bones['pelvis'].head
    low = min((SW @ S.pose.bones[n].head).z for n in ('ball_l', 'ball_r', 'foot_l', 'foot_r') if n in S.pose.bones)
    ratio = t_hip_h / max(1e-6, sp0.z - low)
    for sname, gname in A['clips']:
        src = names.get(sname)
        if not src or not gname:
            continue
        use_action(S, src)
        old = bpy.data.actions.get(gname)
        if old and old not in out_actions:
            old.name = '_src_' + gname  # 來源也有同名的動作（Yes）：先改名，匯出的名稱才不會變成 Yes.001
        act = bpy.data.actions.new(gname)
        use_action(T, act)
        f0, f1 = int(src.frame_range[0]), int(src.frame_range[1])
        for f in list(range(f0, f1 + 1, 2)) + ([f1] if (f1 - f0) % 2 else []):  # 每 2 格一個關鍵格（線性插值）
            sc.frame_set(f)
            P = {}  # 這一格的目標骨頭（骨架座標）
            for b in order:
                n = b.name
                par = b.parent.name if b.parent else None
                rel = (A0[par].inverted() @ A0[n]) if par else A0[n]
                natural = (P[par] @ rel) if par else A0[n]
                sn = INV.get(n)
                if sn and sn in S.pose.bones and sn in rs0:
                    rs = (SW @ S.pose.bones[sn].matrix).to_3x3().normalized().to_quaternion()
                    d = rs @ rs0[sn].inverted()
                    R = Rarm.inverted() @ d @ Rarm @ A0[n].to_quaternion()
                    if n == 'Hips':
                        dv = (SW @ S.pose.bones['pelvis'].head) - sp0
                        head = A0[n].translation + MWi3 @ (dv * ratio)
                    elif n in FOOT:
                        an = FOOT[n]
                        head = (P[an] @ A0[an].inverted() @ A0[n]).translation
                    else:
                        head = natural.translation
                    M = Matrix.Translation(head) @ R.to_matrix().to_4x4()
                elif n in FOOT:
                    an = FOOT[n]
                    M = P[an] @ A0[an].inverted() @ A0[n]
                else:
                    M = natural
                P[n] = M
            # 手臂 IK：照抄角度時，這些人物肩膀窄、手臂短，手會跑到身體中間交疊（交談、搬東西）。
            # 手的位置照來源「相對於胸口、依身高比例縮放」，兩節骨頭的解析解算上臂與前臂，手肘的方向照來源
            if ARM_IK and gname in IK_CLIPS:
                fix_arms(S, SW, P)
            for b in order:
                n = b.name
                par = b.parent.name if b.parent else None
                rel = (A0[par].inverted() @ A0[n]) if par else A0[n]
                natural = (P[par] @ rel) if par else A0[n]
                pb = T.pose.bones[n]
                pb.matrix_basis = (natural.inverted() @ P[n]) if par else (A0[n].inverted() @ P[n])
                if par:  # 根骨頭不寫（它的平移在往返之後不同）
                    pb.keyframe_insert('rotation_quaternion', frame=f)
                    if n == 'Hips' or n in FOOT:
                        pb.keyframe_insert('location', frame=f)
        slim(act)
        out_actions.append(act)
        print('動作', gname, f1 - f0 + 1, '格')

# 只留目標的骨架與新動作
for o in list(bpy.data.objects):
    if o != T:
        bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a not in out_actions:
        bpy.data.actions.remove(a)
for a in out_actions:
    a.use_fake_user = True
    tr = T.animation_data.nla_tracks.new()
    tr.name = a.name
    tr.strips.new(a.name, int(a.frame_range[0]), a)
T.animation_data.action = None
bpy.ops.export_scene.gltf(
    filepath=A['out'],
    export_format='GLB',
    export_animation_mode='ACTIONS',
    export_force_sampling=False,  # 只輸出有關鍵格的通道（根骨頭不動）
    export_optimize_animation_size=True,
)
print('輸出', A['out'], len(out_actions), '個動作')
