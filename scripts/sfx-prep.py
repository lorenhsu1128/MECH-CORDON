"""音效改版（docs/audio-design.md）的素材轉檔：把下載的素材包切割、裁長度、淡出、正規化，轉成單聲道 mp3 放進 src/assets/sfx2/。

用法：python scripts/sfx-prep.py <素材包解壓後的資料夾> [輸出資料夾＝src/assets/sfx2]
需要 numpy 與 imageio-ffmpeg（提供 ffmpeg）。素材包的來源與授權見 src/assets/sfx2/CREDITS.txt；
<素材包資料夾> 底下的子資料夾名稱就是下面 MAP 的第一段（firearm、blacklodge…，下載後照這個名字解壓）。

MAP 的每一項：鍵名（遊戲裡用的名稱）→ (來源的相對路徑, 選項)
  n     第幾發（依起音切割後的第 n 段，1 起算；沒寫＝整個檔案）
  len   最長秒數（超過的裁掉並淡出）
  start 從第幾秒開始
  loud  依峰值排序的第幾段（1＝最響；錄音裡夾著上膛等機械聲時用）
  free  不在下一個起音截斷（遠距離的回音會被當成新的起音）
  th    切割的門檻（峰值的比例，預設 0.3）
  gain  正規化後再乘的倍數（預設 1＝峰值 -1 dBFS）
  kbps  位元率（預設 80）
"""
import os
import subprocess
import sys

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
FA = 'firearm/Prepared SFX Library/'
BL = 'blacklodge/50-Free-SciFi-SFX-blacklodgegames.com/'
BM = 'bl_metal/27-Metal-Audio-Samples-blacklodgegames.com/'
CI = 'castiron/cast iron clangs - Marker #'

MAP = {
    # ---- 槍聲（Still North Media 的槍械庫：near＝近距離、mid＝中距離，當遠距離用）----
    'rifleN1': (FA + 'AR-15/D_32P.wav', dict(n=1, len=0.7)),
    'rifleN2': (FA + 'AR-15/D_32P.wav', dict(n=2, len=0.7)),
    'rifleN3': (FA + 'AK-47/C_28P.wav', dict(n=1, len=0.7)),
    'rifleN4': (FA + 'AK-47/C_28P.wav', dict(n=3, len=0.7)),
    'rifleF1': (FA + 'AR-15/D_24P.wav', dict(loud=1, len=1.5, free=1)),
    'rifleF2': (FA + 'AK-47/C_31P.wav', dict(loud=1, len=1.5, free=1)),
    'pistolN1': (FA + '1911/A_42P.wav', dict(n=1, len=0.7)),
    'pistolN2': (FA + '1911/A_42P.wav', dict(n=2, len=0.7)),
    'pistolF1': (FA + '1911/A_34P.wav', dict(loud=1, len=1.4, free=1)),
    'smgN1': (FA + 'Carl Gustav M45/G_31P.wav', dict(n=1, len=0.32)),
    'smgN2': (FA + 'Carl Gustav M45/G_31P.wav', dict(n=2, len=0.32)),
    'smgN3': (FA + 'Carl Gustav M45/G_31P.wav', dict(n=3, len=0.32)),
    'smgF1': (FA + 'Carl Gustav M45/G_20P.wav', dict(loud=1, len=0.9, free=1)),
    'sgN1': (FA + 'Mossberg/N_30P.wav', dict(n=1, len=0.9)),
    'sgN2': (FA + 'Nova/O_21P.wav', dict(n=1, len=0.9)),
    'sgN3': (FA + 'Model 12/K_22P.wav', dict(n=1, len=0.9)),
    'sgF1': (FA + 'Mossberg/N_26P.wav', dict(loud=1, len=1.6, free=1)),
    'sgF2': (FA + 'Nova/O_17P.wav', dict(loud=1, len=1.6, free=1)),
    'hvyN1': (FA + 'Mosin Nagant/M_21P.wav', dict(n=1, len=0.45)),
    'hvyN2': (FA + 'Tikka/W_29P.wav', dict(n=1, len=0.9)),
    'hvyN3': (FA + '1917/B_24P.wav', dict(n=1, len=0.9)),
    'hvyF1': (FA + 'Mosin Nagant/M_26P.wav', dict(loud=1, len=1.7, free=1)),
    'hvyF2': (FA + 'Tikka/W_24P.wav', dict(loud=1, len=1.7, free=1)),
    # Michel Baradari（CC-BY 3.0）：低頻厚的槍聲，當自機的本體層
    'bChain': ('baradari_shots/shots/cg1.wav', {}),
    'bRifle': ('baradari_shots/shots/rifle.wav', dict(len=1.4)),
    'bShotgun': ('baradari_shots/shots/shotgun.wav', {}),
    'bPistol': ('baradari_shots/shots/pistol.wav', {}),
    # rubberduck「25 CC0 bang」：砲聲（火箭筒、榴彈、電磁砲的本體）
    'cannon1': ('rd_bang/cannon_01.ogg', {}),
    'cannon2': ('rd_bang/cannon_02.ogg', dict(len=1.3)),
    'cannon3': ('rd_bang/cannon_04.ogg', {}),
    'boomLow': ('rd_bang/bang_03.ogg', {}),
    'bang1': ('rd_bang/bang_01.ogg', {}),
    'bang2': ('rd_bang/bang_09.ogg', {}),
    # ---- 能量武器 ----
    'lzA1': ('kenney_digital/laser1.mp3', dict(len=0.9)),
    'lzA2': ('kenney_digital/laser3.mp3', dict(len=0.9)),
    'lzA3': ('kenney_digital/laser2.mp3', dict(len=0.9)),
    'lzB1': ('kenney_digital/laser6.mp3', dict(len=0.8)),
    'lzB2': ('kenney_digital/laser9.mp3', dict(len=0.8)),
    'beam1': (BL + 'blg_beam_01.wav', {}),
    'beam2': (BL + 'blg_beam_02.wav', {}),
    'beam3': (BL + 'blg_beam_03.wav', {}),
    'rLaser': ('rd_scifi/retro_laser_01.ogg', {}),
    'zap1': ('kenney_digital/zap1.mp3', {}),
    'zap2': ('kenney_digital/zap2.mp3', {}),
    'phUp': ('kenney_digital/phaserUp3.mp3', {}),
    'phDown': ('kenney_digital/phaserDown2.mp3', {}),
    'eLow1': (BL + 'blg_energy_field_08.wav', {}),
    'eLow2': (BL + 'blg_energy_field_12.wav', {}),
    'eLow3': (BL + 'blg_energy_field_16.wav', {}),
    'eMid1': (BL + 'blg_energy_field_01.wav', {}),
    'eMid2': (BL + 'blg_energy_field_05.wav', {}),
    'eHi1': (BL + 'blg_energy_field_03.wav', {}),
    'eHi2': (BL + 'blg_energy_field_06.wav', {}),
    'eHi3': (BL + 'blg_energy_field_10.wav', {}),
    'wobble': (BL + 'blg_low_bass_wobble.wav', {}),
    'sciBoom': ('rd_scifi/explosion_01.ogg', {}),
    'rocket': ('rd_scifi/rocket_01.ogg', dict(len=1.6)),
    # ---- 空域：飛掠 ----
    'fly1': (BL + 'blg_alien_starship_flyby_01.wav', {}),
    'fly2': (BL + 'blg_alien_starship_flyby_03.wav', {}),
    'fly3': (BL + 'blg_alien_starship_flyby_05.wav', {}),
    'fly4': (BL + 'blg_alien_starship_flyby_07.wav', {}),
    'fly5': (BL + 'blg_alien_starship_flyby_11.wav', {}),
    'flyHi1': (BL + 'blg_alien_starship_flyby_04.wav', {}),
    'flyHi2': (BL + 'blg_alien_starship_flyby_10.wav', {}),
    'warnA': (BL + 'blg_warning_alarm_01.wav', {}),
    'warnB': (BL + 'blg_warning_alarm_02.wav', {}),
    # ---- 機甲：伺服、腳步 ----
    'servo1': (BL + 'blg_a_robo_01.wav', {}),
    'servo2': (BL + 'blg_a_robo_02.wav', {}),
    'servo3': (BL + 'blg_a_robo_04.wav', {}),
    'servo4': (BL + 'blg_a_robo_05.wav', {}),
    'servo5': (BL + 'blg_a_robo_06.wav', {}),
    'servo6': (BL + 'blg_a_robo_07.wav', {}),
    'servoHi': (BL + 'blg_a_robo_10.wav', {}),
    'robo1': ('barkovich_robotic/robotic/robot1.wav', {}),
    'robo2': ('barkovich_robotic/robotic/robot3.wav', {}),
    'roboStand': ('barkovich_robotic/robotic/robotstand.wav', {}),
    'mStep1': ('barkovich_robotic/robotic/robotstep1.wav', {}),
    'mStep2': ('barkovich_robotic/robotic/robotstep2.wav', {}),
    'mStep3': ('barkovich_robotic/robotic/robotstep3.wav', {}),
    'mStep4': ('barkovich_robotic/robotic/robotstep4.wav', {}),
    'mStomp': ('barkovich_robotic/robotic/robotstomp.wav', {}),
    'qStomp': ('stomp.flac', {}),
    # ---- 金屬、撞擊、彈殼 ----
    'mHit1': (BM + 'dull_metal_collision_01_44k_32bit_stereo.wav', {}),
    'mHit2': (BM + 'dull_metal_collision_04_44k_32bit_stereo.wav', {}),
    'mHit3': (BM + 'dull_metal_collision_05_44k_32bit_stereo.wav', {}),
    'mHit4': (BM + 'dull_metal_collision_06_44k_32bit_stereo.wav', {}),
    'mHit5': (BM + 'dull_metal_collision_09_44k_32bit_stereo.wav', {}),
    'mHvy1': (BM + 'dull_metal_collision_07_44k_32bit_stereo.wav', {}),
    'mHvy2': (BM + 'dull_metal_collision_08_44k_32bit_stereo.wav', {}),
    'mHvy3': (BM + 'dull_metal_collision_13_44k_32bit_stereo.wav', {}),
    'mWob1': (BM + 'wobble_04_44k_32bit_stereo.wav', {}),
    'mWob2': (BM + 'wobble_07_44k_32bit_stereo.wav', {}),
    'mWob3': (BM + 'wobble_10_44k_32bit_stereo.wav', {}),
    'grit': (BM + 'metal_grit_01_44k_32bit_stereo.wav', {}),
    'clangs': (BM + 'rapid_clangs_01_44k_32bit_stereo.wav', {}),
    'clink1': ('metalimp/clink1_0.wav', {}),
    'clink2': ('metalimp/clink2.wav', {}),
    'clink3': ('metalimp/clink3.wav', {}),
    'bing': ('metalimp/bing1.wav', {}),
    'iron1': (CI + '10.wav', dict(len=0.8)),
    'iron2': (CI + '21.wav', dict(len=0.8)),
    'iron3': (CI + '8.wav', dict(len=0.8)),
    'iron4': (CI + '23.wav', dict(len=0.8)),
    'impStone': ('qimpact/qubodupImpact/qubodupImpactStone.ogg', {}),
    'impMetal': ('qimpact/qubodupImpact/qubodupImpactMetal.ogg', {}),
    # ---- 近戰的刀刃交擊（Still North Media 的中世紀武器撞擊）----
    'clash1': ('med1/Axe Spear Blade on Blade.wav', dict(loud=1, len=0.8)),
    'clash2': ('med1/Axe Spear Blade on Blade.wav', dict(loud=2, len=0.8)),
    'clash3': ('med2/Seax Norse Sword Blade on Blade.wav', dict(loud=1, len=0.8)),
    'clash4': ('med2/Spear Spear Blade on Blade.wav', dict(loud=1, len=0.8)),
    'clashHvy': ('med1/Mace Spear Blade.wav', dict(loud=1, len=0.8)),
    # ---- 爆炸 ----
    'exA': ('baradari_expl/explosions/explode.wav', {}),
    'exMini': ('baradari_expl/explosions/explodemini.wav', {}),
    'exHuge': ('deathflash.flac', dict(kbps=96)),
}


def load(p):
    out = subprocess.run([FF, '-v', 'quiet', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def onsets(x, th):
    h = SR // 200
    env = np.array([np.abs(x[i:i + h]).max() for i in range(0, len(x), h)])
    pk = env.max()
    res, quiet = [], 99
    for i, v in enumerate(env):
        if v > pk * th and quiet >= 12:
            res.append(i * h)
        quiet = quiet + 1 if v < pk * 0.1 else 0
    return res


def cut(x, o):
    if 'start' in o:
        x = x[int(o['start'] * SR):]
    if 'n' in o or 'loud' in o:
        ons = onsets(x, o.get('th', 0.3))
        k = o['n'] - 1 if 'n' in o else None
        if k is None:
            # 依峰值排序（錄音裡夾著上膛等機械聲時，用最響的第 loud 段）
            seg = [(ons[i], ons[i + 1] if i + 1 < len(ons) else len(x)) for i in range(len(ons))]
            pk = [np.abs(x[a:b]).max() for a, b in seg]
            k = int(np.argsort(pk)[::-1][o['loud'] - 1])
        if k >= len(ons):
            raise ValueError(f'只有 {len(ons)} 段')
        a = max(0, ons[k] - SR // 200)
        b = ons[k + 1] - SR // 100 if k + 1 < len(ons) and not o.get('free') else len(x)
        x = x[a:b]
    if 'len' in o:
        x = x[: int(o['len'] * SR)]
    # 尾巴低於 -50 dB 的裁掉、最後 30 ms 淡出、開頭 2 ms 淡入（不會喀一聲）
    p = np.abs(x).max()
    idx = np.where(np.abs(x) > p * 0.0032)[0]
    if len(idx):
        x = x[: idx[-1] + 1]
    x = x.copy()
    fl = min(len(x), int(0.03 * SR))
    x[-fl:] *= np.linspace(1, 0, fl)
    fi = min(len(x), int(0.002 * SR))
    x[:fi] *= np.linspace(0, 1, fi)
    return x * (0.89 / max(p, 1e-6)) * o.get('gain', 1)


def save(path, x, kbps):
    subprocess.run([FF, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=x.astype(np.float32).tobytes(), check=True)


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'sfx2')
    os.makedirs(out, exist_ok=True)
    total = 0
    for key, (rel, o) in MAP.items():
        x = cut(load(os.path.join(src, rel)), o)
        p = os.path.join(out, key + '.mp3')
        save(p, x, o.get('kbps', 80))
        sz = os.path.getsize(p)
        total += sz
        print(f'{key:10s} {len(x) / SR:5.2f}s {sz // 1024:4d} KB  ← {rel}')
    print(f'共 {len(MAP)} 個、{total / 1024 / 1024:.2f} MB')


main()
