# 過場人物的匯入（scripts/people-import.js 呼叫）：glTF → 只有網格＋骨架的 GLB（動作拿掉：同一套骨架的動作共用，另外存一份）。
# 參數（-- 之後一個 JSON）：{ jobs: [[來源 .gltf, 輸出 .glb]...], anims: [[來源 .gltf, 輸出 .glb]...] }
import bpy, sys, json

A = json.loads(sys.argv[sys.argv.index('--') + 1])


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30


for src, out in A['jobs']:
    fresh()
    bpy.ops.import_scene.gltf(filepath=src)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data_clear()
    # Draco 壓縮網格（render/glb.js 的 parseGlb 需要時才載入解碼器）
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
    )
    print('人物', out)

for src, out in A.get('anims', []):
    fresh()
    bpy.ops.import_scene.gltf(filepath=src)
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    # 每個動作放進自己的 NLA 軌，匯出時一個動作一段
    ad = arm.animation_data or arm.animation_data_create()
    for a in bpy.data.actions:
        a.use_fake_user = True
        tr = ad.nla_tracks.new()
        tr.name = a.name
        tr.strips.new(a.name, int(a.frame_range[0]), a)
    ad.action = None
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_animation_mode='ACTIONS',
        export_optimize_animation_size=True,
    )
    print('動作', out, len(bpy.data.actions))
