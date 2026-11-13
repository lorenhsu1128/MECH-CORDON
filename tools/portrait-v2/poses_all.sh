cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
until curl -s -m 2 http://127.0.0.1:8188/system_stats >/dev/null; do sleep 3; done
ST="Same anime cel-shaded art style, clean lines, same cowboy-shot framing (from the thighs up), plain pure white background, no text."
run(){ # 角色 姿勢 提示
  [ -n "$(ls tools/comfyui/runtime/work/v2/$1/$2/*.png 2>/dev/null)" ] && return
  node scripts/chargen.js edit --images=src/assets/characters/$1/p1.webp --prompt="$3 $KEEP $ST" --seeds=11,22 --out=v2/$1/$2 2>&1 | grep -v "^  種子"; }
Q3L="Turn the whole body and head to a three-quarter view facing the LEFT side of the image (about 40 degrees), eyes looking toward the left edge."
Q3R="Turn the whole body and head to a three-quarter view facing the RIGHT side of the image (about 40 degrees), eyes looking toward the right edge."

KEEP="Keep exactly the same woman: same mature face, narrow gentle light grey-blue eyes, semi-rimless glasses, dark blue-black hair in a low loose bun with loose strands and one grey streak, long white lab coat with thin blue trim and a triangle-circle emblem on the left chest, black high-collar shirt, small blue vial-shaped brooch, data tablet with a pale blue glowing screen."
c=aetheric
run $c p3_q3l "$Q3L Holding the tablet against her chest, polite smile."
run $c p4_q3r "$Q3R Holding the tablet against her chest, polite smile."
run $c p5_lean "She leans toward the viewer, peering closely with fascinated wide eyes and a deepening smile, one finger pushing up her glasses."
run $c p6_note "She writes on the tablet with a stylus while glancing at the viewer coldly with an expressionless face, like observing a specimen."
run $c p7_chin "She rests her chin on her hand with the other arm folded under the elbow, thinking, eyes half-closed with a faint smile."
run $c p8_back "She has turned her back to the viewer, showing the back of the white lab coat, and looks back over her shoulder with a faint calm smile."
run $c p9_offer "She extends one open palm toward the viewer in a gentle inviting gesture, the tablet in the other hand, kind smile."
run $c p10_glasses "She has taken off her glasses and holds them in one hand at chest height, serious sad expression, looking straight at the viewer."

KEEP="Keep exactly the same young woman: same face with pointed chin, upturned green eyes, little fang, messy short blonde bob tucked behind one ear, oversized lime green safety jacket with reflective stripes and barcode stickers, black hoodie, headphones around the neck, black shorts, black pantyhose, stopwatch."
c=veerwell
run $c p3_q3l "$Q3L One hand on her hip, cocky grin."
run $c p4_q3r "$Q3R One hand on her hip, cocky grin."
run $c p5_wink "She winks playfully with one eye and makes a peace sign next to her face with her free hand, grinning with the fang showing."
run $c p6_tap "She holds the stopwatch up toward the viewer and taps it with her index finger, impatient frown, mouth open complaining."
run $c p7_cold "Arms crossed, chin raised, looking down at the viewer with cold emotionless eyes, no smile at all."
run $c p8_relax "Both hands behind her head, leaning back casually, wide carefree grin with eyes closed."
run $c p9_money "She rubs her thumb against her fingers in a money gesture near her face, sly scheming grin, eyes narrowed."
run $c p10_back "She has turned her back to the viewer, showing the back of the green jacket with reflective stripes, and glances back over her shoulder coldly."

KEEP="Keep exactly the same woman: same calm face, amber tired eyes, light freckles, warm brown medium hair in a low ponytail over the shoulder with loose strands, mustard yellow field medic jacket with an arm patch of two hands holding a circle, dark turtleneck sweater, sleeves rolled up, belt pouch, dark pants, several old dog tags wrapped around her wrist, worn notebook and pen."
c=sancta
run $c p3_q3l "$Q3L Notebook held against her chest, serious face."
run $c p4_q3r "$Q3R Notebook held against her chest, serious face."
run $c p5_write "She looks down and writes in the open notebook with the pen, lips pressed together, focused and grave."
run $c p6_tags "Eyes closed, head slightly bowed, she holds the dog tags on her wrist with her other hand against her chest, mourning."
run $c p7_wary "Arms crossed with the notebook tucked under one arm, eyes narrowed, distrustful glare at the viewer."
run $c p8_stop "She thrusts one open palm toward the viewer in a firm stop gesture, stern expression, mouth open saying stop."
run $c p9_smile "A small tired but warm smile, the notebook lowered at her side, shoulders relaxed, looking at the viewer kindly."
run $c p10_fist "She clenches a fist in front of her chest, angry determined glare, teeth gritted."

KEEP="Keep exactly the same young woman: same round face, big droopy light blue eyes, large round glasses, fluffy ash brown short hair with an ahoge and long bangs, oversized white lab coat with sleeves past her fingers and thin light blue trim, light blue sweater vest over a white collared shirt, light blue lanyard, folders and a tablet."
c=mira
run $c p3_q3l "$Q3L Hugging the folders, shoulders hunched, nervous."
run $c p4_q3r "$Q3R Hugging the folders, shoulders hunched, nervous."
run $c p5_drop "Papers are flying out of her arms as she drops the folders, panicked wide eyes, open mouth, sweat drops."
run $c p6_shh "She holds an index finger to her lips in a shh gesture, glancing sideways nervously as if checking nobody is listening."
run $c p7_peek "She holds the tablet up in front of her face with both hands, peeking over its top edge at the viewer with worried eyes."
run $c p8_glasses "She pushes her glasses up with one finger, a determined but trembling expression, sweat drop."
run $c p9_bow "She bows deeply and apologetically toward the viewer, hands together in front, eyes squeezed shut."
run $c p10_note "She holds a small crumpled note out toward the viewer with both hands, earnest serious face, eyebrows raised."

KEEP="Keep exactly the same young woman: same calm face, narrow pale blue eyes with faint ring patterns, black chin-length bob with swept bangs over one eyebrow, pale blue inner hair with faintly glowing tips, slim silver data-port hairclip, single headset on the right ear with a thin microphone boom, oversized white hooded jacket slipping off the shoulders with pale blue trim, black sleeveless turtleneck with a faint star chart print, black cargo pants with pale blue straps."
c=echo
run $c p3_q3l "$Q3L One hand in her pocket, calm faint smile."
run $c p5_q3r "$Q3R One hand in her pocket, calm faint smile."
run $c p6_cross "Arms crossed, weight on one leg, a dry one-sided smirk, looking at the viewer."
run $c p7_listen "Eyes closed, one hand pressing the headset to her ear, head slightly tilted, concentrating on listening."
run $c p8_hesitate "She looks down and away, one hand clutching the front of her jacket at her chest, lips parted as if hesitating to speak."
run $c p9_puzzled "Head tilted, slight frown, one finger touching her chin, puzzled look at the viewer."
run $c p10_reach "She reaches one open hand gently toward the viewer, soft tender smile, eyes relaxed."

KEEP="Keep exactly the same young woman: same calm face, narrow pale blue eyes, black chin-length bob with swept bangs over one eyebrow, pale blue inner hair with warm white glowing tips, slim silver data-port hairclip, no headset, white hooded jacket worn properly on both shoulders and open, pale blue ribbed turtleneck sweater with a small white star emblem on the chest, black cargo pants."
c=echo_true
run $c p4_q3l "$Q3L Hands loosely together in front, gentle smile."
run $c p5_q3r "$Q3R Hands loosely together in front, gentle smile."
run $c p6_behind "Hands clasped behind her back, leaning slightly forward, warm soft smile at the viewer."
run $c p7_star "Eyes closed, one hand placed over the small white star on her chest, peaceful expression."
run $c p8_reach "She reaches one open hand toward the viewer, eyes glistening, gentle sad smile."
run $c p9_down "She looks down sadly with her arms hanging, lips pressed, shoulders slightly slumped."

KEEP="Keep exactly the same man: same young lean face, sharp narrow grey eyes, old scar across the eyebrow, layered short black hair swept to the side showing the forehead with grey sideburns, long black coat draped on the shoulders with purple lining, dark grey standing-collar uniform with purple piping and line-only rank insignia, black tactical gloves, belt, small earpiece on the left ear."
c=instructor
run $c p3_q3l "$Q3L Hands behind his back, standing straight, stern."
run $c p4_q3r "$Q3R Hands behind his back, standing straight, stern."
run $c p5_shout "He points forward past the viewer with his arm fully extended, shouting a command, mouth wide open, brows furrowed."
run $c p6_approve "Arms crossed, he gives a slight nod with the faintest smile at the corner of his mouth, approving."
run $c p7_tablet "He looks down at a tactical tablet held in one hand, evaluating, cold expression."
run $c p8_back "He has turned his back to the viewer, the long black coat on his shoulders, and looks back over his shoulder with a sharp stern glance."
run $c p9_glove "He pulls his black glove tighter on one hand, looking at the viewer with a cold serious stare."
run $c p10_halt "He raises one hand with an open palm in a halt signal, stern face, mouth closed."

KEEP="Keep exactly the same man: same young slender face, gentle brown half-closed eyes, light stubble on the chin, layered long silver-white hair tied in a low ponytail with strands over the forehead, worn sand-colored flight jacket with a fur collar and elbow patches, black pilot suit unzipped at the collar, two dog tags, dented metal coffee mug."
c=basalt
run $c p3_q3l "$Q3L Holding the mug, relaxed half smile."
run $c p4_q3r "$Q3R Holding the mug, relaxed half smile."
run $c p5_sip "He sips from the metal mug with his eyes closed, calm and relaxed."
run $c p6_thumb "He gives a relaxed thumbs-up toward the viewer with an easy grin, the mug in the other hand."
run $c p7_weary "He scratches the back of his head and sighs with his eyes closed, tired shoulders."
run $c p8_hand "He reaches one hand toward the viewer as if placing it on their shoulder, foreshortened hand, warm reassuring look."
run $c p9_laugh "He laughs with his head tilted back slightly, eyes closed, holding the mug."
run $c p10_serious "Arms crossed, no smile, serious steady gaze at the viewer."

KEEP="Keep exactly the same teenage girl: same face with big mint green eyes, energetic eyebrows, bandaid on her cheek, long pink hair in a high side ponytail on the right with a mint green scrunchie, messy bangs, new white and black flight suit with mint green trim, oversized black hooded jacket with rolled sleeves, small old teddy bear charm, wrist device, fingerless gloves."
c=wren
run $c p3_q3l "$Q3L One fist in front of her chest, nervous smile."
run $c p4_q3r "$Q3R One fist in front of her chest, nervous smile."
run $c p5_salute "She gives an energetic salute with her right hand at her brow, big determined smile."
run $c p6_bear "She hugs the small teddy bear charm to her chest with both hands, nervous worried look, sweat drop."
run $c p7_cheer "Both fists raised in an excited victory pose, wide open happy smile."
run $c p8_tear "She wipes a tear from the corner of her eye with one finger while smiling bravely."
run $c p9_bow "She bows quickly toward the viewer, hands at her sides, eyes squeezed shut, apologetic."
run $c p10_point "She points forward with her arm extended, determined glare, teeth gritted."
echo ALLDONE
