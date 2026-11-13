cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
until curl -s -m 2 http://127.0.0.1:8188/system_stats >/dev/null; do sleep 3; done
ST="Same anime cel-shaded art style, clean lines, same cowboy-shot framing (from the thighs up), plain pure white background, no text."
run(){ # 角色 輸出資料夾 姿勢 提示
  [ -n "$(ls tools/comfyui/runtime/work/v2/$2/$3/*.png 2>/dev/null)" ] && return
  node scripts/chargen.js edit --images=src/assets/characters/$1/p1.webp --prompt="$4 $KEEP $ST" --seeds=11,22 --out=v2/$2/$3 2>&1 | grep -v "^  種子"; }
Q3L="Turn the whole body and head to a three-quarter view facing the LEFT side of the image (about 40 degrees), eyes looking toward the left edge."
Q3R="Turn the whole body and head to a three-quarter view facing the RIGHT side of the image (about 40 degrees), eyes looking toward the right edge."

KEEP="Keep exactly the same young woman: same calm face with clean smooth cheeks (no marks, no circles, no symbols on the face), narrow pale blue eyes, black chin-length bob with swept bangs over one eyebrow, pale blue inner hair with faintly glowing tips, slim silver data-port hairclip, single headset on the right ear with a thin microphone boom, oversized white hooded jacket slipping off the shoulders with pale blue trim, black sleeveless turtleneck with a faint star chart print, black cargo pants with pale blue straps."
c=echo; o=echo_r
run $c $o p3_q3l "$Q3L One hand in her pocket, calm faint smile."
run $c $o p5_q3r "$Q3R One hand in her pocket, calm faint smile."
run $c $o p6_cross "Arms crossed, weight on one leg, a dry one-sided smirk, looking at the viewer."
run $c $o p7_listen "Eyes closed, one hand pressing the headset to her ear, head slightly tilted, concentrating on listening."
run $c $o p8_hesitate "She looks down and away, one hand clutching the front of her jacket at her chest, lips parted as if hesitating to speak."
run $c $o p9_puzzled "Head tilted, slight frown, one finger touching her chin, puzzled look at the viewer."
run $c $o p10_reach "She reaches one open hand gently toward the viewer, soft tender smile, eyes relaxed."

KEEP="Keep exactly the same woman: same mature face, narrow gentle light grey-blue eyes, dark blue-black hair in a low loose bun with loose strands and one grey streak, long white lab coat with thin blue trim and a triangle-circle emblem on the left chest, black high-collar shirt, small blue vial-shaped brooch."
run aetheric aetheric_r p10_glasses "She is NOT wearing her glasses: her face is bare with no glasses on it. She holds the folded semi-rimless glasses in one hand in front of her chest. Serious, sad expression, looking straight at the viewer with bare eyes."
echo FIXDONE
