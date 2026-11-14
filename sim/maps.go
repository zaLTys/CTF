package sim

import "math"

const (
	Width  = 2400.0
	Height = 1440.0
	Tick   = 1.0 / 30
)

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

var Bases = map[string]Point{
	"blue": {235, 720},
	"red":  {2165, 720},
}

type VehicleType struct {
	Label       string  `json:"label"`
	Speed       float64 `json:"speed"`
	Accel       float64 `json:"accel"`
	Brake       float64 `json:"brake"`
	Coast       float64 `json:"coast"`
	TurnRate    float64 `json:"turnRate"`
	Grip        float64 `json:"grip"`
	Reverse     float64 `json:"reverse"`
	HP          float64 `json:"hp"`
	Ammo        float64 `json:"ammo"`
	Fuel        float64 `json:"fuel"`
	FireMs      float64 `json:"fireMs"`
	Damage      float64 `json:"damage"`
	BulletSpeed float64 `json:"bulletSpeed,omitempty"`
	Radius      float64 `json:"radius"`
	Range       float64 `json:"range,omitempty"`
	BlastRadius float64 `json:"blastRadius,omitempty"`
	Mines       float64 `json:"mines,omitempty"`
}

var Types = map[string]*VehicleType{
	"jeep": {Label: "Recon Jeep", Speed: 330, Accel: 505, Brake: 570, Coast: 190, TurnRate: 3.65, Grip: 5.9, Reverse: .43, HP: 90, Ammo: 12, Fuel: 100, FireMs: 820, Damage: 58, BulletSpeed: 760, Radius: 17, Range: 360, BlastRadius: 74, Mines: 6},
	"tank": {Label: "Battle Tank", Speed: 195, Accel: 290, Brake: 410, Coast: 160, TurnRate: 2.55, Grip: 8.4, Reverse: .53, HP: 220, Ammo: 40, Fuel: 100, FireMs: 500, Damage: 35, BulletSpeed: 630, Radius: 24},
	"heli": {Label: "Attack Heli", Speed: 285, Accel: 385, Brake: 175, Coast: 100, TurnRate: 2.8, Grip: 1.2, Reverse: 1, HP: 125, Ammo: 150, Fuel: 100, FireMs: 125, Damage: 12, BulletSpeed: 780, Radius: 22},
	"asv":  {Label: "Rocket ASV", Speed: 144, Accel: 185, Brake: 300, Coast: 130, TurnRate: 1.75, Grip: 7.1, Reverse: .36, HP: 270, Ammo: 25, Fuel: 100, FireMs: 800, Damage: 65, BulletSpeed: 510, Radius: 25},
	"arty": {Label: "Field Artillery", Speed: 122, Accel: 160, Brake: 240, Coast: 120, TurnRate: 1.55, Grip: 7.4, Reverse: .35, HP: 160, Ammo: 12, Fuel: 100, FireMs: 2600, Damage: 145, Radius: 27, Range: 980, BlastRadius: 115},
	"fpv":  {Label: "FPV Operator", Speed: 162, Accel: 300, Brake: 360, Coast: 165, TurnRate: 2.6, Grip: 6.7, Reverse: .5, HP: 110, Ammo: 5, Fuel: 100, FireMs: 900, Damage: 125, Radius: 22, BlastRadius: 95, Range: 640},
}

type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type Ellipse struct {
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	RX float64 `json:"rx"`
	RY float64 `json:"ry"`
}

type BridgeDef struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
	Name string  `json:"name"`
}

type MapDef struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Biome     string      `json:"biome"`
	Seed      uint32      `json:"-"`
	Water     []Rect      `json:"water"`
	Mud       []Ellipse   `json:"mud"`
	Cover     []Rect      `json:"cover"`
	Roads     []Rect      `json:"roads"`
	Bridges   []BridgeDef `json:"bridges"`
	Buildings []Rect      `json:"buildings"`
	Foliage   int         `json:"-"`
	// Coast is the island shoreline; everything outside it is open sea.
	Coast []Point `json:"-"`
}

const coastCorner = 280.0

// makeCoast traces the shoreline as a rounded rectangle pulled inland by a seeded
// wobble. Only even harmonics are used, so the coast keeps every map's 180-degree
// symmetry, and the shore is held back from both base pads.
func makeCoast(seed uint32) []Point {
	random := rng(seed ^ 0x9e3779b9)
	p1, p2, p3 := random()*2*math.Pi, random()*2*math.Pi, random()*2*math.Pi
	R := coastCorner
	sw, sh, arc := Width-2*R, Height-2*R, math.Pi/2*R
	perimeter := 2*sw + 2*sh + 4*arc
	const samples = 480
	pts := make([]Point, 0, samples)
	for i := 0; i < samples; i++ {
		s := perimeter * float64(i) / samples
		x, y, nx, ny := roundedRectAt(s, R, sw, sh, arc)
		u := 2 * math.Pi * s / perimeter
		inset := 72 + 26*math.Sin(10*u+p1) + 14*math.Sin(18*u+p2) + 7*math.Sin(32*u+p3)
		for _, b := range Bases {
			w := 1 - clamp((hypot(x-b.X, y-b.Y)-300)/180, 0, 1)
			inset += (math.Min(inset, 44) - inset) * w
		}
		pts = append(pts, Point{x - nx*inset, y - ny*inset})
	}
	return pts
}

// roundedRectAt walks the world rectangle with rounded corners clockwise from the
// top edge and returns the point and its outward normal at arc length s.
func roundedRectAt(s, R, sw, sh, arc float64) (x, y, nx, ny float64) {
	corner := func(cx, cy, start, along float64) (float64, float64, float64, float64) {
		a := start + along/R
		return cx + R*math.Cos(a), cy + R*math.Sin(a), math.Cos(a), math.Sin(a)
	}
	switch {
	case s < sw:
		return R + s, 0, 0, -1
	case s < sw+arc:
		return corner(Width-R, R, -math.Pi/2, s-sw)
	case s < sw+arc+sh:
		return Width, R + s - sw - arc, 1, 0
	case s < sw+2*arc+sh:
		return corner(Width-R, Height-R, 0, s-sw-arc-sh)
	case s < 2*sw+2*arc+sh:
		return Width - R - (s - sw - 2*arc - sh), Height, 0, 1
	case s < 2*sw+3*arc+sh:
		return corner(R, Height-R, math.Pi/2, s-2*sw-2*arc-sh)
	case s < 2*sw+3*arc+2*sh:
		return 0, Height - R - (s - 2*sw - 3*arc - sh), -1, 0
	default:
		return corner(R, R, math.Pi, s-2*sw-3*arc-2*sh)
	}
}

func pointInPoly(pts []Point, x, y float64) bool {
	inside := false
	for i, j := 0, len(pts)-1; i < len(pts); j, i = i, i+1 {
		a, b := pts[i], pts[j]
		if (a.Y > y) != (b.Y > y) && x < (b.X-a.X)*(y-a.Y)/(b.Y-a.Y)+a.X {
			inside = !inside
		}
	}
	return inside
}

// OnIsland reports whether (x, y) is on land, keeping at least margin from the shore.
func (m *MapDef) OnIsland(x, y, margin float64) bool {
	if !pointInPoly(m.Coast, x, y) {
		return false
	}
	if margin <= 0 {
		return true
	}
	for _, d := range [][2]float64{{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {.7, .7}, {-.7, .7}, {.7, -.7}, {-.7, -.7}} {
		if !pointInPoly(m.Coast, x+d[0]*margin, y+d[1]*margin) {
			return false
		}
	}
	return true
}

type MapChoice struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Biome string `json:"biome"`
}

var causewayWater = []Rect{{1020, -30, 360, 505}, {1020, 965, 360, 505}}

var causewayCover = []Rect{
	{610, 340, 92, 90}, {1698, 1010, 92, 90},
	{610, 1010, 92, 90}, {1698, 340, 92, 90},
	{855, 605, 75, 100}, {1470, 735, 75, 100},
	{855, 735, 75, 100}, {1470, 605, 75, 100},
	{1120, 655, 160, 130},
}

var causewayMud = []Ellipse{
	{850, 290, 152, 112}, {1550, 1150, 152, 112},
	{820, 1150, 115, 80}, {1580, 290, 115, 80},
	{1190, 535, 80, 52}, {1210, 905, 80, 52},
}

// Every battlefield is 180-degree rotationally symmetrical to keep both teams fair.
var Maps = map[string]*MapDef{
	"causeway": {
		ID: "causeway", Name: "OLD CAUSEWAY", Biome: "temperate", Seed: 19950325,
		Water: causewayWater, Mud: causewayMud, Cover: causewayCover,
		Roads: []Rect{{0, 612, Width, 216}, {1162, 0, 76, Height}},
		Bridges: []BridgeDef{
			{984, 210, 432, 104, "NORTH CROSSING"},
			{984, 1126, 432, 104, "SOUTH CROSSING"},
		},
		Buildings: []Rect{
			{750, 260, 106, 90}, {1544, 1090, 106, 90},
			{750, 1090, 106, 90}, {1544, 260, 106, 90},
		},
		Foliage: 100,
	},
	"delta": {
		ID: "delta", Name: "RIVER DELTA", Biome: "wetlands", Seed: 428911,
		Water: []Rect{
			{960, -25, 480, 555}, {960, 910, 480, 555},
			{350, 180, 190, 150}, {1860, 1110, 190, 150},
		},
		Mud: []Ellipse{
			{840, 435, 140, 120}, {1560, 1005, 140, 120},
			{820, 1020, 130, 90}, {1580, 420, 130, 90},
			{1210, 585, 110, 50}, {1190, 855, 110, 50},
		},
		Cover: []Rect{
			{600, 415, 95, 105}, {1705, 920, 95, 105},
			{600, 920, 95, 105}, {1705, 415, 95, 105},
			{865, 595, 85, 94}, {1450, 751, 85, 94},
			{865, 751, 85, 94}, {1450, 595, 85, 94},
		},
		Roads: []Rect{{0, 612, Width, 216}, {1162, 0, 76, Height}},
		Bridges: []BridgeDef{
			{929, 200, 542, 100, "DELTA NORTH"},
			{929, 1140, 542, 100, "DELTA SOUTH"},
		},
		Buildings: []Rect{
			{760, 275, 108, 92}, {1532, 1073, 108, 92},
			{760, 1073, 108, 92}, {1532, 275, 108, 92},
		},
		Foliage: 118,
	},
	"badlands": {
		ID: "badlands", Name: "DUST & IRON", Biome: "arid", Seed: 814072,
		Water: []Rect{
			{650, 225, 340, 255}, {1410, 960, 340, 255},
			{1030, 15, 340, 160}, {1030, 1265, 340, 160},
		},
		Mud: []Ellipse{
			{485, 365, 180, 100}, {1915, 1075, 180, 100},
			{850, 1030, 200, 115}, {1550, 410, 200, 115},
			{1210, 540, 110, 60}, {1190, 900, 110, 60},
		},
		Cover: []Rect{
			{590, 515, 92, 95}, {1718, 830, 92, 95},
			{590, 830, 92, 95}, {1718, 515, 92, 95},
			{1040, 480, 88, 90}, {1272, 870, 88, 90},
			{1040, 870, 88, 90}, {1272, 480, 88, 90},
		},
		Roads: []Rect{{0, 632, Width, 176},
			{350, 170, 95, 450}, {1955, 820, 95, 450},
			{1152, 0, 96, Height}},
		Bridges: []BridgeDef{
			{618, 306, 404, 92, "QUARRY PASS"},
			{1378, 1042, 404, 92, "SOUTH VIADUCT"},
		},
		Buildings: []Rect{
			{780, 530, 112, 91}, {1508, 819, 112, 91},
			{780, 819, 112, 91}, {1508, 530, 112, 91},
		},
		Foliage: 76,
	},
}

var MapChoices = []MapChoice{
	{"causeway", "OLD CAUSEWAY", "temperate"},
	{"delta", "RIVER DELTA", "wetlands"},
	{"badlands", "DUST & IRON", "arid"},
}

type turretSpot struct {
	team string
	x, y float64
}

var turretPositions = []turretSpot{
	{"blue", 450, 520}, {"blue", 450, 920}, {"red", 1950, 520}, {"red", 1950, 920},
}

type wallPiece struct {
	Rect
	gate bool
}

// baseWalls rings each HQ with a wall and three gates (toward the centre and to
// either flank). Gates open only for the owning team. Laid out for blue and
// mirrored 180 degrees for red, like the rest of the map.
var baseWalls = func() map[string][]wallPiece {
	b := Bases["blue"]
	const hx, hy, th, mainGate, sideGate = 180.0, 162.0, 14.0, 120.0, 90.0
	x0, x1, y0, y1 := b.X-hx-th/2, b.X+hx-th/2, b.Y-hy-th/2, b.Y+hy-th/2
	bottom, gx := y1+th, b.X+112
	blue := []wallPiece{
		{Rect{x0, y0, th, bottom - y0}, false},
		{Rect{x1, y0, th, b.Y - mainGate/2 - y0}, false},
		{Rect{x1, b.Y - mainGate/2, th, mainGate}, true},
		{Rect{x1, b.Y + mainGate/2, th, bottom - b.Y - mainGate/2}, false},
	}
	for _, y := range []float64{y0, y1} {
		blue = append(blue,
			wallPiece{Rect{x0 + th, y, gx - sideGate/2 - x0 - th, th}, false},
			wallPiece{Rect{gx - sideGate/2, y, sideGate, th}, true},
			wallPiece{Rect{gx + sideGate/2, y, x1 - gx - sideGate/2, th}, false})
	}
	red := make([]wallPiece, len(blue))
	for i, p := range blue {
		red[i] = wallPiece{Rect{Width - p.X - p.W, Height - p.Y - p.H, p.W, p.H}, p.gate}
	}
	return map[string][]wallPiece{"blue": blue, "red": red}
}()

var supplyCrates = []Rect{
	{525, 265, 40, 39}, {1835, 1136, 40, 39},
	{525, 1136, 40, 39}, {1835, 265, 40, 39},
	{760, 465, 52, 34}, {1588, 941, 52, 34},
	{763, 945, 50, 38}, {1587, 457, 50, 38},
	{1010, 552, 43, 40}, {1347, 848, 43, 40},
}

func mapFor(id string) *MapDef {
	if m, ok := Maps[id]; ok {
		return m
	}
	return Maps["causeway"]
}

func SurfaceAt(x, y float64, mapID string) string {
	m := mapFor(mapID)
	for _, r := range m.Roads {
		if x >= r.X && x <= r.X+r.W && y >= r.Y && y <= r.Y+r.H {
			return "road"
		}
	}
	for _, e := range m.Mud {
		dx, dy := (x-e.X)/e.RX, (y-e.Y)/e.RY
		if dx*dx+dy*dy < 1 {
			return "mud"
		}
	}
	return "grass"
}

// rng reproduces the JavaScript LCG so every map keeps its existing scenery layout.
func rng(seed uint32) func() float64 {
	return func() float64 {
		seed = seed*1664525 + 1013904223
		return float64(seed) / 4294967296
	}
}

func makeScenery(m *MapDef) []Object {
	random := rng(m.Seed)
	var props []Object
	valid := func(x, y, r float64) bool {
		if !(x > 65 && x < Width-65 && y > 55 && y < Height-55) || !m.OnIsland(x, y, r+22) {
			return false
		}
		for _, w := range m.Roads {
			if circleRect(x, y, r+15, w) {
				return false
			}
		}
		for _, w := range m.Water {
			if circleRect(x, y, r+20, w) {
				return false
			}
		}
		for _, w := range m.Cover {
			if circleRect(x, y, r+30, w) {
				return false
			}
		}
		for _, w := range m.Buildings {
			if circleRect(x, y, r+25, w) {
				return false
			}
		}
		for _, b := range m.Bridges {
			if circleRect(x, y, r+20, Rect{b.X, b.Y, b.W, b.H}) {
				return false
			}
		}
		for _, b := range Bases {
			if hypot(x-b.X, y-b.Y) < 262 {
				return false
			}
		}
		for _, t := range turretPositions {
			if hypot(x-t.x, y-t.y) < 75 {
				return false
			}
		}
		for _, c := range props {
			if hypot(c.X-x, c.Y-y) <= c.Radius+r+16 {
				return false
			}
		}
		return true
	}
	id := 1
	for i := 0; i < m.Foliage; i++ {
		isRock := i%13 == 0
		isBush := i%5 == 0 && !isRock
		kind := "tree"
		if isRock {
			kind = "rock"
		} else if isBush {
			kind = "bush"
		}
		var radius float64
		switch kind {
		case "rock":
			radius = 14 + random()*12
		case "bush":
			radius = 10 + random()*10
		default:
			radius = 14 + random()*13
		}
		var hp float64
		switch kind {
		case "rock":
			hp = 9999
		case "bush":
			hp = 24
		default:
			hp = jsRound(72 + radius*2.35)
		}
		for tries := 0; tries < 45; tries++ {
			x, y := 80+random()*1040, 75+random()*1290
			if !valid(x, y, radius) || !valid(Width-x, Height-y, radius) {
				continue
			}
			for _, pt := range [][2]float64{{x, y}, {Width - x, Height - y}} {
				props = append(props, Object{ID: id, Kind: kind, X: jsRound(pt[0]), Y: jsRound(pt[1]),
					Radius: jsRound(radius), HP: hp, MaxHP: hp, Rot: jsRound(random() * 360)})
				id++
			}
			break
		}
	}
	return props
}

var scenery = func() map[string][]Object {
	out := map[string][]Object{}
	for id, m := range Maps {
		m.Coast = makeCoast(m.Seed)
		out[id] = makeScenery(m)
	}
	return out
}()
