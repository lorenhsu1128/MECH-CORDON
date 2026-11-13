import subprocess, sys, os, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
YT = os.path.join(os.path.dirname(sys.executable), 'yt-dlp.exe')
vids = sys.argv[1].split(',')
n = int(sys.argv[2])
for v in vids:
    v, dur = v.split(':')
    dur = int(dur)
    try:
        url = subprocess.check_output([YT, '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]', '-g', 'https://www.youtube.com/watch?v=' + v], text=True, timeout=120).strip().split('\n')[0]
    except Exception as e:
        print(v, 'url fail', e); continue
    for i in range(n):
        t = int(dur * (i + 0.5) / n)
        out = f'frames/{v}_{t:06d}.jpg'
        if os.path.exists(out): continue
        r = subprocess.run([FF, '-loglevel', 'error', '-ss', str(t), '-i', url, '-frames:v', '1', '-q:v', '3', '-y', out], timeout=120)
        print(v, t, 'ok' if os.path.exists(out) else 'fail', flush=True)
