cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
ST="Same anime cel-shaded art style, clean lines, same cowboy-shot framing (from the thighs up), plain pure white background, no text."
KEEP="Keep exactly the same teenage girl and exactly the same outfit as the reference: same face with big mint green eyes, energetic eyebrows, bandaid on her cheek, long pink hair in a high side ponytail on the right with a mint green scrunchie, messy bangs. Her oversized hooded jacket is WHITE (white body and white sleeves) with a black hood, black inner lining and black rolled cuffs, NOT a black jacket. White shirt underneath, mint green belt, small teddy bear charm at her waist, wrist device, black fingerless gloves."
run(){ [ -n "$(ls tools/comfyui/runtime/work/v2/wren_r/$1/*.png 2>/dev/null)" ] && return
  node scripts/chargen.js edit --images=src/assets/characters/wren/p1.webp --prompt="$2 $KEEP $ST" --seeds=11,22,33 --out=v2/wren_r/$1 2>&1 | grep -v "^  種子"; }
run p5_salute "She gives an energetic salute with her right hand at her brow, big determined smile."
run p7_cheer "Both fists raised in an excited victory pose, wide open happy smile."
run p8_tear "She wipes a tear from the corner of her eye with one finger while smiling bravely."
run p9_bow "She bows quickly toward the viewer, hands at her sides, eyes squeezed shut, apologetic."
run p10_point "She points forward with her arm extended, determined glare, teeth gritted."
echo WRENDONE
