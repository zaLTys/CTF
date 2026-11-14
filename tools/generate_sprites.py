"""Generate original, dependency-free top-down SVG vehicle assets for Flag Run."""
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'public' / 'assets'
out.mkdir(parents=True, exist_ok=True)


def circle(cx, cy, r, fill, stroke='none', sw=1):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

def rect(x, y, w, h, fill, rx=0, stroke='none', sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

def path(d, fill='none', stroke='none', sw=1):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>'

def line(x1,y1,x2,y2,color,width=1):
    return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'

def text(x,y,s,fill,size=8):
    return f'<text x="{x}" y="{y}" text-anchor="middle" fill="{fill}" font-family="Arial,sans-serif" font-size="{size}" font-weight="900">{s}</text>'


def wrap(body, accent, name):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="{name} top-down sprite">
    <defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#89937c"/><stop offset=".42" stop-color="#4b5c4e"/><stop offset="1" stop-color="#26372f"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="#9ed2d0"/><stop offset=".45" stop-color="#2b5360"/><stop offset="1" stop-color="#102b39"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{accent}"/><stop offset="1" stop-color="#52675b"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="1.5" dy="4" stdDeviation="3" flood-color="#07140f" flood-opacity=".55"/></filter>
    </defs><g filter="url(#shadow)">{body}</g></svg>'''

# Artwork faces +x, so sprites rotate on their center in game.
def tank(ac):
    parts=[rect(22,30,82,22,'#17251e',7),rect(22,76,82,22,'#17251e',7)]
    for x in range(29,100,10):
        parts += [rect(x,31,6,19,'#6a7363',2),rect(x,78,6,19,'#6a7363',2)]
    parts += [path('M22 48L33 38H94L102 48V80L92 89H33L22 79Z','url(#metal)','#17251d',3),
        path('M26 50L37 43H91L97 49V77L90 84H36L26 76Z','url(#accent)','#b8be99',1),
        rect(33,47,10,32,'#2b3a31',2),rect(82,48,11,31,'#38493c',2),
        rect(48,51,43,4,'#aab19a',1),rect(48,73,43,4,'#1c332b',1),
        circle(67,64,22,'#192c25','#889882',2),circle(67,64,18,'url(#metal)','#182e25',2),
        path('M66 55 L111 55 L120 60 L120 68 L111 72 L66 72Z','#263b2f','#0c2119',2),
        path('M86 58 L116 58 L116 61 L86 61Z','#bac7aa'),rect(113,57,7,13,'#121e19',2),
        circle(65,64,11,'#566a57','#b4c3a4',2),circle(65,64,6,'#263d33','#9fac91',1),
        path('M50 54L59 47L67 48L60 55Z','#b8bea6'),rect(30,55,9,18,'#35483a',2),
        rect(33,59,4,3,ac,1),circle(87,48,2,ac),circle(87,80,2,ac)]
    return ''.join(parts)

def jeep(ac):
    parts=[]
    for x in (35,83):
        for y in (36,84):
            parts.append(rect(x-12,y-9,22,18,'#1b241d',4,'#737969',1))
            for z in range(3):parts.append(line(x-10+z*6,y-7,x-10+z*6,y+7,'#454d40',2))
    parts += [path('M24 52L36 43H88L101 52V77L86 85H35L24 77Z','#22372b','#172820',3),
        path('M29 55L39 48H85L95 54V75L84 80H38L29 74Z','url(#accent)','#c0c6a8',1.5),
        rect(40,51,29,26,'#263a34',4),rect(52,53,19,22,'url(#glass)',3,'#b0bca0',1),
        path('M71 51L91 54V74L71 77Z','#4c6150','#99ab8c',1),
        path('M77 56L87 57M78 71L87 70',stroke='#26392f',sw=3),
        rect(93,54,8,7,'#f3d08b',1),rect(93,69,8,7,'#f3d08b',1),
        circle(31,64,10,'#202d25','#a3ac90',2),circle(31,64,5,'#586c53'),
        rect(37,48,5,31,'#202f28',1),rect(39,51,4,4,ac,1),
        rect(47,48,17,3,'#b6bb9b',1),rect(81,78,7,4,'#192c23')]
    return ''.join(parts)

def heli(ac):
    parts=[path('M6 57L54 58L64 63L54 69L6 70Z','#405b50','#20332b',2),
        rect(8,46,7,37,'#2e493a',1),rect(0,62,21,5,'#b4c1ab',1),
        path('M42 44C61 37 89 43 101 56L109 64L101 73C85 89 57 84 42 73Z','url(#metal)','#1d3329',3),
        path('M72 47Q94 45 101 63Q96 80 72 79Q80 65 72 47Z','url(#glass)','#bfd4cc',1.5),
        path('M46 49L63 48L63 80L46 77Z','url(#accent)','#b5c4a9',1.5),
        rect(32,40,38,5,'#212c27',2),rect(32,84,38,5,'#212c27',2),
        line(36,41,27,29,'#94a893',3),line(36,87,27,98,'#94a893',3),
        rect(13,60,29,8,'#20372e',1),
        circle(62,64,8,'#15271e','#c8d6b4',2),circle(62,64,3,ac),
        path('M60 12L66 12L67 116L61 116Z','#acbfad','#304c41',1.2),
        path('M14 62L114 62L114 67L14 67Z','#b1c3ab','#314b41',1),
        circle(64,64,5,'#182d25','#c6d4b9',2)]
    return ''.join(parts)

def asv(ac):
    parts=[rect(25,31,76,19,'#1f2c24',6),rect(25,79,76,19,'#1f2c24',6)]
    for x in range(29,98,11):parts += [rect(x,31,6,18,'#687566',2),rect(x,79,6,18,'#687566',2)]
    parts += [path('M24 47L34 40H94L103 47V82L94 89H33L24 81Z','url(#metal)','#172921',3),
        path('M31 48L90 44L99 51V77L90 84H31Z','url(#accent)','#bac6a8',1.5),
        rect(37,46,38,36,'#20382d',4,'#a3b79e',2),rect(43,49,25,30,'#3d5240',3),
        path('M65 45L99 45L105 54V74L99 83L65 83Z','#2f4639','#9aad8b',2)]
    for y in (52,65,78):
        parts += [rect(63,y-5,30,8,'#182920',3,'#a8b39b',1),circle(94,y-1,5,'#b99766','#453f29',2)]
    parts += [circle(43,61,7,'#8c9d8b','#152c22',2),circle(43,61,3,ac),rect(29,58,7,5,ac,1)]
    return ''.join(parts)

def arty(ac):
    parts=[path('M17 40L39 48L46 59L38 72L17 89L11 83L29 65L11 46Z','#384e3d','#a1b09b',2),
        rect(24,34,67,62,'#23372d',7,'#152821',2),
        circle(40,34,14,'#18241e','#75816d',3),circle(40,94,14,'#18241e','#75816d',3),
        circle(40,34,7,'#616c5b','#c2c5a9',2),circle(40,94,7,'#616c5b','#c2c5a9',2),
        path('M32 48L52 40L91 48L98 57V72L88 83L52 87L32 78Z','url(#metal)','#1a2a22',3),
        path('M44 53L77 48L84 56V73L44 77Z','url(#accent)','#b0bc9e',1),
        path('M61 59L116 59L122 62L122 67L116 70L61 70Z','#293c2f','#b2bea6',2),
        rect(102,57,12,15,'#192d23',2),rect(65,52,16,22,'#314735',4,'#b1b99c',1),
        circle(67,64,13,'#51634d','#1b3026',3),circle(67,64,6,'#23382c','#b8c9a6',1),
        rect(34,52,8,7,'#99a288',1),rect(35,70,8,7,'#99a288',1)]
    return ''.join(parts)

def fpv(ac):
    parts=[]
    for x in (35,90):
        for y in (38,88):parts.append(rect(x-10,y-10,20,19,'#172820',4,'#707763',1.5))
    parts += [path('M23 50L35 43H90L103 53V77L89 85H33L23 76Z','url(#metal)','#142720',3),
        path('M29 54L40 48H86L97 55V73L86 80H40L29 74Z','url(#accent)','#bed0a8',1.5),
        rect(55,51,20,26,'#354e42',3,'#9caf9a',1),
        rect(77,54,18,20,'url(#glass)',3),circle(41,64,11,'#2c493b','#a7bda5',2),
        circle(41,64,5,'#1d2d24','#dbdfb4',1),line(42,55,42,33,'#c5d0bc',2),circle(42,32,3,ac),
        path('M41 36 Q23 32 22 48',stroke='#e8e6ad',sw=2),
        path('M50 42L64 28L79 42M55 30L75 30',stroke='#c6d5c2',sw=2),
        circle(65,30,4,'#172f2a','#d6e0b9',2),
        rect(90,56,9,7,'#f0cf90',1),rect(90,69,9,7,'#f0cf90',1)]
    return ''.join(parts)

def drone(ac):
    parts=[path('M27 63L48 55L80 72L99 62',stroke='#202c25',sw=5),
        path('M24 63L47 74L82 54L102 63',stroke='#1d3026',sw=5),
        path('M39 57L88 57L95 64L88 71L39 71L33 64Z','url(#metal)','#1b3026',3),
        path('M77 58L101 64L77 70Z','url(#accent)','#c4cfad',1),
        rect(41,61,20,7,'#20392d',3),circle(24,63,13,'none','#b8c8b1',3),
        circle(103,63,13,'none','#b8c8b1',3),circle(46,43,12,'none','#b8c8b1',3),
        circle(82,85,12,'none','#b8c8b1',3),
        circle(52,63,4,ac),rect(59,59,8,10,'#1e3026',2)]
    return ''.join(parts)

# Independent tank hull/turret layers allow hull rotation without rotating the gun.
def tank_hull(ac):
    complete=tank(ac)
    return complete.split('<circle cx="67" cy="64" r="22"')[0] + rect(31,55,8,18,'#35483a',2) + rect(33,59,4,3,ac,1)

def tank_turret(ac):
    return ''.join([
        circle(67,64,22,'#192c25','#889882',2),circle(67,64,18,'url(#metal)','#182e25',2),
        path('M66 55 L111 55 L120 60 L120 68 L111 72 L66 72Z','#263b2f','#0c2119',2),
        path('M86 58 L116 58 L116 61 L86 61Z','#bac7aa'),rect(113,57,7,13,'#121e19',2),
        circle(65,64,11,'#566a57','#b4c3a4',2),circle(65,64,6,'#263d33','#9fac91',1),
        path('M50 54L59 47L67 48L60 55Z','#b8bea6'),circle(87,48,2,ac),circle(87,80,2,ac)
    ])

funcs={'tank':tank,'tank-hull':tank_hull,'tank-turret':tank_turret,'jeep':jeep,'heli':heli,'asv':asv,'arty':arty,'fpv':fpv,'drone':drone}
for side,accent in [('blue','#57c9df'),('red','#f58d6a')]:
    for unit,func in funcs.items():
        (out/f'{side}-{unit}.svg').write_text(wrap(func(accent),accent,unit),encoding='utf-8')
print(f'Generated {len(list(out.glob("*.svg")))} original sprites in {out}')
