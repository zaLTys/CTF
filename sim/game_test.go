package sim

import (
	"math"
	"strings"
	"testing"
)

type msg = map[string]any

func input(fields msg) msg {
	m := msg{"type": "input", "dx": 0.0, "dy": 0.0, "aim": 0.0, "fire": false}
	for k, v := range fields {
		m[k] = v
	}
	return m
}

func runTicks(r *Room, count int, begin float64) {
	for i := 0; i < count; i++ {
		Step(r, begin+float64(i)*1000/30, Tick)
	}
}

// runUntilDeath steps like runTicks but reports whether p died at any point,
// since a drowned vehicle respawns at base a few seconds later.
func runUntilDeath(r *Room, p *Player, count int, begin float64) bool {
	for i := 0; i < count; i++ {
		Step(r, begin+float64(i)*1000/30, Tick)
		if !p.Alive {
			return true
		}
	}
	return false
}

func clearTerrain(r *Room) {
	r.Obstacles, r.Scenery, r.Turrets = nil, nil, nil
}

func speedOf(p *Player) float64 { return math.Hypot(p.VX, p.VY) }

func check(t *testing.T, ok bool, format string, args ...any) {
	t.Helper()
	if !ok {
		t.Fatalf(format, args...)
	}
}

func TestRoomBalancesFourPlayers(t *testing.T) {
	r := CreateRoom("ABCDE", "")
	a, b := AddPlayer(r, "a"), AddPlayer(r, "b")
	check(t, a.Team == "blue" && b.Team == "red", "first two players split teams")
	c, d := AddPlayer(r, "c"), AddPlayer(r, "d")
	check(t, c.Team == "blue" && d.Team == "red", "next two players split teams")
	check(t, AddPlayer(r, "e") == nil, "fifth player is rejected")
	RemovePlayer(r, "a")
	check(t, len(r.Players) == 3, "player removed")
}

func TestInvalidVehicleAndSwitchOutsideBase(t *testing.T) {
	r := CreateRoom("ABCDE", "")
	p := AddPlayer(r, "a")
	SetInput(p, msg{"type": "vehicle", "vehicle": "jet"})
	check(t, p.Type == "tank", "unknown vehicle rejected")
	p.X = 900
	SetInput(p, msg{"type": "vehicle", "vehicle": "jeep"})
	check(t, p.Type == "tank", "switch outside base rejected")
	p.X = Bases["blue"].X
	SetInput(p, msg{"type": "vehicle", "vehicle": "jeep"})
	check(t, p.Type == "jeep" && p.HP == Types["jeep"].HP, "switch at base applies vehicle stats")
}

func TestInputIsClamped(t *testing.T) {
	r := CreateRoom("ABCDE", "")
	p := AddPlayer(r, "a")
	SetInput(p, msg{"type": "input", "dx": 100.0, "dy": 100.0, "aim": "invalid", "fire": false})
	check(t, math.Hypot(p.Input.DX, p.Input.DY) <= 1.00000001, "movement vector normalised")
	check(t, !math.IsNaN(p.Input.Aim), "aim stays finite")
	x, y := p.X, p.Y
	Step(r, nowMs(), Tick)
	check(t, math.Hypot(p.X-x, p.Y-y) < Types["tank"].Speed/30+.1, "one tick cannot exceed top speed")
}

func TestOnlyJeepStealsAndScores(t *testing.T) {
	r := CreateRoom("ABCDE", "")
	p := AddPlayer(r, "a")
	p.X, p.Y = Bases["red"].X, Bases["red"].Y
	now := nowMs()
	Step(r, now, Tick)
	check(t, r.Flags["red"].CarriedBy == "", "tank cannot steal the flag")
	p.X, p.Y = Bases["blue"].X, Bases["blue"].Y
	SetInput(p, msg{"type": "vehicle", "vehicle": "jeep"})
	p.X, p.Y = Bases["red"].X, Bases["red"].Y
	Step(r, now+100, Tick)
	check(t, r.Flags["red"].CarriedBy == "a", "jeep steals the flag")
	p.X, p.Y = Bases["blue"].X, Bases["blue"].Y
	Step(r, now+200, Tick)
	check(t, r.Scores["blue"] == 1 && r.Flags["red"].CarriedBy == "", "jeep scores at home")
}

func TestProjectilesHitOnServer(t *testing.T) {
	r := CreateRoom("ABCDE", "")
	a, b := AddPlayer(r, "a"), AddPlayer(r, "b")
	a.X, a.Y, b.X, b.Y = 650, 720, 780, 720
	a.Angle, a.Input.Aim = 0, 0
	SetInput(a, input(msg{"fire": true}))
	hp, now := b.HP, nowMs()
	for i := 0; i < 30; i++ {
		Step(r, now+float64(i)*33.333, Tick)
	}
	check(t, b.HP < hp, "enemy takes projectile damage")
}

func TestArtilleryRangeAndDelay(t *testing.T) {
	r := CreateRoom("ARTY1", "")
	a, b := AddPlayer(r, "a"), AddPlayer(r, "b")
	a.Type, a.HP, a.Ammo, a.Deploy = "arty", Types["arty"].HP, Types["arty"].Ammo, Deployed
	a.X, a.Y, b.X, b.Y = 690, 510, 1010, 510
	now, hp := 100_000.0, b.HP
	SetInput(a, input(msg{"fire": true, "targetX": b.X, "targetY": b.Y}))
	Step(r, now, Tick)
	check(t, len(r.Strikes) == 1 && a.Ammo == Types["arty"].Ammo-1, "strike queued")
	check(t, b.HP == hp, "no immediate damage")
	Step(r, now+1100, Tick)
	check(t, b.HP == hp, "still in flight")
	Step(r, now+1300, Tick)
	check(t, b.HP < hp && len(r.Strikes) == 0, "shell lands and damages")
}

func TestArtilleryMinMaxRange(t *testing.T) {
	r := CreateRoom("ARTY2", "")
	p := AddPlayer(r, "a")
	p.Type, p.Ammo, p.Deploy = "arty", 12, Deployed
	now := 100_000.0
	SetInput(p, input(msg{"fire": true, "targetX": p.X + 20, "targetY": p.Y}))
	Step(r, now, Tick)
	check(t, len(r.Strikes) == 0 && p.Ammo == 12, "inside minimum range rejected")
	SetInput(p, input(nil))
	Step(r, now+50, Tick)
	SetInput(p, input(msg{"fire": true, "targetX": p.X + 1200, "targetY": p.Y}))
	Step(r, now+100, Tick)
	check(t, len(r.Strikes) == 0, "outside maximum range rejected")
}

func TestFPVDroneHitsEnemy(t *testing.T) {
	r := CreateRoom("DRONE", "")
	a, b := AddPlayer(r, "a"), AddPlayer(r, "b")
	a.Type, a.HP, a.Ammo, a.X, a.Y = "fpv", Types["fpv"].HP, Types["fpv"].Ammo, 690, 720
	b.X, b.Y = 960, 720
	hp, now := b.HP, 100_000.0
	SetInput(a, input(msg{"dx": 1.0, "fire": true}))
	Step(r, now, Tick)
	check(t, len(r.Drones) == 1 && a.Ammo == Types["fpv"].Ammo-1, "drone launched")
	SetInput(a, input(msg{"dx": 1.0}))
	for i := 1; i <= 17; i++ {
		Step(r, now+float64(i)*33, Tick)
	}
	check(t, len(r.Drones) == 0, "collision detonates the drone")
	check(t, b.HP < hp, "drone damages the enemy")
}

func TestRocketHitsOnce(t *testing.T) {
	r := CreateRoom("ROCKT", "")
	a, b := AddPlayer(r, "a"), AddPlayer(r, "b")
	a.Type, a.HP, a.Ammo = "asv", Types["asv"].HP, Types["asv"].Ammo
	a.X, a.Y, b.X, b.Y = 680, 720, 830, 720
	now := 100_000.0
	SetInput(a, input(msg{"fire": true}))
	for i := 0; i < 12; i++ {
		Step(r, now+float64(i)*33, Tick)
	}
	check(t, len(r.Bullets) == 0, "rocket removed after impact")
}

func TestAccelerationAndCoasting(t *testing.T) {
	r := CreateRoom("MOTION", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.X, p.Y = 430, 720
	SetInput(p, input(msg{"dx": 1.0}))
	Step(r, 200_000, Tick)
	initial := speedOf(p)
	check(t, initial > 0 && initial < Types["tank"].Speed*.5, "gradual start, got %v", initial)
	runTicks(r, 12, 200_034)
	fast := speedOf(p)
	check(t, fast > initial*3, "tank gathers speed")
	SetInput(p, input(nil))
	oldX := p.X
	Step(r, 201_000, Tick)
	check(t, p.X > oldX, "coasting persists after throttle release")
	check(t, speedOf(p) < fast, "rolling resistance slows it")
	runTicks(r, 100, 201_034)
	check(t, speedOf(p) < .001, "eventually stops")
}

func TestJeepFasterThanArmor(t *testing.T) {
	results := map[string]float64{}
	for _, kind := range []string{"jeep", "tank", "asv"} {
		r := CreateRoom("RACE", "")
		p := AddPlayer(r, "pilot")
		clearTerrain(r)
		p.Type, p.X, p.Y, p.BodyAngle = kind, 415, 720, 0
		SetInput(p, input(msg{"dx": 1.0}))
		runTicks(r, 33, 200_000)
		results[kind] = speedOf(p)
	}
	check(t, results["jeep"] > results["tank"] && results["tank"] > results["asv"], "speeds %v", results)
}

func TestTankPivotsAndClassicSteering(t *testing.T) {
	r := CreateRoom("TURN", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.X, p.Y = 550, 720
	SetInput(p, input(msg{"dy": 1.0}))
	Step(r, 200_000, Tick)
	check(t, p.BodyAngle > 0 && p.BodyAngle < .15, "limited turn rate, got %v", p.BodyAngle)
	runTicks(r, 60, 200_000)
	check(t, p.BodyAngle > 1, "tank eventually faces the steering direction")
	p.BodyAngle, p.VX, p.VY = 0, 0, 0
	SetInput(p, input(msg{"dx": 1.0, "dy": -1.0, "driveMode": "classic"}))
	runTicks(r, 25, 210_000)
	check(t, p.BodyAngle > .25, "classic steering changes heading")
	check(t, speedOf(p) > 20, "classic throttle drives forward")
}

func TestRoadsBeatMud(t *testing.T) {
	speeds := map[string]float64{}
	for _, c := range []struct {
		terrain string
		x, y    float64
	}{{"road", 440, 720}, {"mud", 780, 290}} {
		r := CreateRoom("MUDDY", "")
		p := AddPlayer(r, "pilot")
		clearTerrain(r)
		p.X, p.Y, p.BodyAngle = c.x, c.y, 0
		SetInput(p, input(msg{"dx": 1.0}))
		runTicks(r, 24, 200_000)
		speeds[c.terrain] = speedOf(p)
		check(t, p.Surface == c.terrain, "surface %s, got %s", c.terrain, p.Surface)
	}
	check(t, speeds["road"] > speeds["mud"]*1.3, "speeds %v", speeds)
}

func TestRiversDrownArmorJeepSwimsHeliFlies(t *testing.T) {
	for _, kind := range []string{"tank", "asv", "arty", "fpv", "jeep", "heli"} {
		r := CreateRoom("WATER", "")
		p := AddPlayer(r, "pilot")
		clearTerrain(r)
		p.Type, p.X, p.Y, p.BodyAngle, p.Fuel = kind, 910, 390, 0, 100
		SetInput(p, input(msg{"dx": 1.0}))
		died := runUntilDeath(r, p, 150, 200_000)
		switch kind {
		case "jeep":
			check(t, !died && p.X > 1100, "jeep swims into the river, died=%v x=%v", died, p.X)
		case "heli":
			check(t, !died && p.X > 1180, "helicopter crosses water x=%v", p.X)
		default:
			check(t, died && p.X > 1000, "%s drowns in the river (died=%v x=%v)", kind, died, p.X)
			for _, w := range r.Wrecks {
				check(t, w.Type != kind, "%s sinks without leaving a wreck", kind)
			}
		}
	}
}

func TestJeepSwimsAtAThirdOfLandSpeed(t *testing.T) {
	speeds := map[string]float64{}
	for _, c := range []struct {
		where string
		x, y  float64
	}{{"land", 560, 420}, {"water", 1040, 390}} {
		r := CreateRoom("SWIM", "")
		p := AddPlayer(r, "pilot")
		clearTerrain(r)
		p.Type, p.X, p.Y, p.BodyAngle = "jeep", c.x, c.y, -math.Pi/2
		SetInput(p, input(msg{"dy": -1.0, "driveMode": "classic"}))
		runTicks(r, 30, 200_000)
		speeds[c.where] = speedOf(p)
	}
	ratio := speeds["water"] / speeds["land"]
	check(t, ratio > .25 && ratio < .42, "water/land speed ratio %.2f (%v)", ratio, speeds)
}

func TestIslandCoast(t *testing.T) {
	for _, id := range []string{"causeway", "delta", "badlands"} {
		m := Maps[id]
		check(t, len(m.Coast) > 100, "%s has a coastline", id)
		for _, b := range Bases {
			check(t, m.OnIsland(b.X, b.Y, 160), "%s base pad is on dry land", id)
		}
		for _, corner := range []Point{{4, 4}, {Width - 4, 4}, {4, Height - 4}, {Width - 4, Height - 4}, {Width / 2, 6}, {6, Height / 2}} {
			check(t, !m.OnIsland(corner.X, corner.Y, 0), "%s edge %v is sea", id, corner)
		}
		for _, o := range scenery[id] {
			check(t, m.OnIsland(o.X, o.Y, o.Radius), "%s scenery %d at %v,%v is on land", id, o.ID, o.X, o.Y)
		}
		for i := 0; i < 400; i++ {
			x, y := 30+float64(i%20)*117, 20+float64(i/20)*70
			check(t, m.OnIsland(x, y, 0) == m.OnIsland(Width-x, Height-y, 0), "%s coast keeps 180-degree symmetry at %v,%v", id, x, y)
		}
	}
	r := CreateRoom("SEA", "")
	clearTerrain(r)
	tank, jeep := AddPlayer(r, "tank"), AddPlayer(r, "jeep")
	tank.Type, tank.X, tank.Y, tank.BodyAngle = "tank", 600, 120, -math.Pi/2
	jeep.Type, jeep.X, jeep.Y, jeep.BodyAngle = "jeep", 900, 120, -math.Pi/2
	SetInput(tank, input(msg{"dy": -1.0, "driveMode": "classic"}))
	SetInput(jeep, input(msg{"dy": -1.0, "driveMode": "classic"}))
	check(t, runUntilDeath(r, tank, 90, 200_000), "tank driving off the island drowns")
	check(t, jeep.Alive && jeep.Surface == "water" && jeep.Y >= Types["jeep"].Radius, "jeep swims out to the world edge, y=%v", jeep.Y)
}

func TestTreesBlockJeepButTankCrushes(t *testing.T) {
	for _, kind := range []string{"jeep", "tank"} {
		r := CreateRoom("FOREST", "")
		p := AddPlayer(r, "pilot")
		clearTerrain(r)
		tree := &Object{ID: 12, Kind: "tree", X: 820, Y: 720, Radius: 20, HP: 95, MaxHP: 95}
		r.Scenery = []*Object{tree}
		p.Type, p.X, p.Y, p.BodyAngle = kind, 650, 720, 0
		SetInput(p, input(msg{"dx": 1.0}))
		runTicks(r, 120, 200_000)
		if kind == "jeep" {
			check(t, tree.HP == 95, "jeep cannot damage tree")
			check(t, p.X < 820-20-Types["jeep"].Radius+2, "tree blocks jeep x=%v", p.X)
		} else {
			check(t, tree.HP == 0, "tank destroys tree")
			check(t, p.X > 840, "tank passes the trunk x=%v", p.X)
		}
	}
}

func TestTankCannonFellsTree(t *testing.T) {
	r := CreateRoom("LOGS", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.X, p.Y, p.BodyAngle = 600, 720, 0
	tree := &Object{ID: 31, Kind: "tree", X: 765, Y: 720, Radius: 21, HP: 70, MaxHP: 70}
	r.Scenery = []*Object{tree}
	SetInput(p, input(msg{"fire": true}))
	runTicks(r, 100, 200_000)
	check(t, tree.HP == 0 && len(r.Scenery) == 1, "stump remains")
	fell := false
	for _, tr := range r.Trails {
		fell = fell || tr.Type == "fall"
	}
	check(t, fell, "fall debris generated")
	SetInput(p, input(msg{"dx": 1.0}))
	runTicks(r, 95, 204_000)
	check(t, p.X > tree.X, "tank passes over stump")
}

func TestArtilleryDamagesCover(t *testing.T) {
	r := CreateRoom("SPLASH", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.Type, p.X, p.Y, p.Angle, p.BodyAngle, p.Deploy = "arty", 380, 720, 0, 0, Deployed
	r.Scenery = []*Object{
		{ID: 1, Kind: "tree", X: 755, Y: 720, Radius: 18, HP: 100, MaxHP: 100},
		{ID: 2, Kind: "bush", X: 802, Y: 712, Radius: 10, HP: 22, MaxHP: 22},
	}
	r.Obstacles = []*Object{
		{ID: 8, Kind: "crate", X: 775, Y: 735, W: 30, H: 30, HP: 50, MaxHP: 50},
		{ID: 9, Kind: "bunker", X: 820, Y: 710, W: 60, H: 60, HP: 195, MaxHP: 195},
	}
	SetInput(p, input(msg{"fire": true, "targetX": 790.0, "targetY": 730.0}))
	Step(r, 100_000, Tick)
	Step(r, 101_300, Tick)
	check(t, r.Scenery[0].HP == 0 && r.Scenery[1].HP == 0, "foliage destroyed")
	check(t, r.Obstacles[0].HP == 0 && r.Obstacles[1].HP < 195, "crate destroyed, bunker damaged")
}

func TestVehiclesCollide(t *testing.T) {
	r := CreateRoom("BUMPER", "")
	a, b := AddPlayer(r, "a"), AddPlayer(r, "b")
	clearTerrain(r)
	a.X, a.Y, b.X, b.Y = 600, 720, 770, 720
	hp := b.HP
	SetInput(a, input(msg{"dx": 1.0}))
	runTicks(r, 60, 200_000)
	rad := Types["tank"].Radius
	check(t, a.X+rad <= b.X+rad*1.1, "tanks stay separated")
	check(t, b.HP < hp, "ramming damages the enemy")
}

func TestThreeMaps(t *testing.T) {
	check(t, len(MapChoices) == 3, "three map choices")
	for _, id := range []string{"causeway", "delta", "badlands"} {
		r := CreateRoom("MAP", id)
		check(t, r.MapID == id, "map %s selected", id)
		check(t, len(r.Map.Water) > 0 && len(r.Bridges) == 2, "map %s has water and two bridges", id)
		check(t, len(r.Scenery) > 90, "map %s has %d scenery", id, len(r.Scenery))
		check(t, TakeSnapshot(r, nowMs(), "").MapID == id, "snapshot map id")
		for _, b := range r.Bridges {
			spans := false
			for _, w := range r.Map.Water {
				spans = spans || (b.X < w.X+w.W && b.X+b.W > w.X && b.Y < w.Y+w.H && b.Y+b.H > w.Y)
			}
			check(t, spans, "bridge %s spans water", b.Name)
		}
	}
	for _, invalid := range []string{"not-real", "constructor", "toString", "__proto__", ""} {
		check(t, CreateRoom("MAP", invalid).MapID == "causeway", "invalid map %q falls back", invalid)
	}
	s := SurfaceAt(1120, 480, "delta")
	check(t, s == "road" || s == "mud" || s == "grass", "surface lookup")
}

func TestBridgeCrossingAndCollapse(t *testing.T) {
	r := CreateRoom("SPAN", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.X, p.Y, p.BodyAngle, p.Fuel = 910, 255, 0, 100
	SetInput(p, input(msg{"dx": 1.0}))
	runTicks(r, 120, 200_000)
	check(t, p.X > 1435, "tank crosses intact bridge x=%v", p.X)
	r.Bridges[0].HP, r.Bridges[0].Stage = 0, 3
	p.X, p.Y, p.VX, p.VY, p.BodyAngle = 910, 255, 0, 0, 0
	check(t, runUntilDeath(r, p, 120, 210_000), "tank drives off the broken crossing and drowns")
}

func TestArtilleryCollapsesBridge(t *testing.T) {
	r := CreateRoom("BOOM", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.Type, p.HP, p.Ammo, p.X, p.Y, p.BodyAngle, p.Deploy = "arty", Types["arty"].HP, 12, 845, 258, 0, Deployed
	b, start := r.Bridges[0], 100_000.0
	for i := 0; i < 3; i++ {
		now := start + float64(i)*3000
		SetInput(p, input(msg{"fire": true, "targetX": 1200.0, "targetY": 258.0}))
		Step(r, now, Tick)
		SetInput(p, input(nil))
		Step(r, now+1300, Tick)
		check(t, b.Stage == i+1, "bridge stage %d, got %d", i+1, b.Stage)
	}
	check(t, b.HP == 0 && b.CollapsedAt == 107300, "bridge collapsed at 107300, got %v", b.CollapsedAt)
	check(t, strings.Contains(r.Announcement, "DESTROYED"), "collapse announced")
}

func TestBuildingCollapseStages(t *testing.T) {
	r := CreateRoom("HOUSE", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	target := r.Map.Buildings[0]
	building := &Object{ID: 99, Kind: "building", X: target.X, Y: target.Y, W: target.W, H: target.H, HP: 300, MaxHP: 300}
	r.Obstacles = []*Object{building}
	p.X, p.Y, p.Type, p.Ammo, p.HP, p.Deploy = 700, 510, "arty", 12, Types["arty"].HP, Deployed
	for i := 0; i < 3; i++ {
		now := 100_000 + float64(i)*3000
		SetInput(p, input(msg{"fire": true, "targetX": target.X + target.W/2, "targetY": target.Y + target.H/2}))
		Step(r, now, Tick)
		SetInput(p, input(nil))
		Step(r, now+1300, Tick)
		check(t, building.Stage == i+1, "building stage %d, got %d", i+1, building.Stage)
	}
	check(t, building.HP == 0, "building destroyed")
}

func TestWrecksPersistAndBlock(t *testing.T) {
	r := CreateRoom("WRECK", "")
	a, b := AddPlayer(r, "blue-player"), AddPlayer(r, "red-player")
	clearTerrain(r)
	a.X, a.Y, b.X, b.Y, a.HP = 1010, 720, 1190, 720, 8
	r.Bullets = append(r.Bullets, &Bullet{ID: "fatal", Team: "red", Kind: "tank", X: 994, Y: 720, VX: 630, Damage: 35, Radius: 5, EndAt: 101_000})
	Step(r, 100_000, Tick)
	check(t, !a.Alive && len(r.Wrecks) == 1 && r.Wrecks[0].Type == "tank", "tank wreck created")
	wreck := r.Wrecks[0]
	Step(r, 102_500, Tick)
	check(t, a.Alive && len(r.Wrecks) == 1, "wreck persists after respawn")
	b.X, b.Y, b.VX, b.VY, b.BodyAngle = 840, 720, 0, 0, 0
	SetInput(b, input(msg{"dx": 1.0}))
	runTicks(r, 90, 103_000)
	check(t, b.X < wreck.X-Types["tank"].Radius-wreck.Radius+7, "wreck blocks tank at %v", b.X)
	r.Bullets = append(r.Bullets, &Bullet{ID: "scrap", Team: "red", Kind: "tank", X: wreck.X - 16, Y: wreck.Y, VX: 630, Damage: 130, Radius: 5, EndAt: 108_000})
	Step(r, 107_000, Tick)
	check(t, wreck.HP == 0 && len(r.Wrecks) == 1, "wreck cleared to scrap")
}

func TestNewRoundResets(t *testing.T) {
	r := CreateRoom("RESET", "badlands")
	p := AddPlayer(r, "pilot")
	r.Bridges[0].HP, r.Bridges[0].Stage = 0, 3
	for _, o := range r.Obstacles {
		if o.Kind == "building" {
			o.HP = 0
			break
		}
	}
	r.Wrecks = append(r.Wrecks, &Object{Kind: "wreck", X: 1000, Y: 700, HP: 110, Radius: 20})
	p.X, p.Y = Bases["blue"].X, Bases["blue"].Y
	SetInput(p, msg{"type": "vehicle", "vehicle": "jeep"})
	p.X, p.Y = Bases["red"].X, Bases["red"].Y
	Step(r, 100_000, Tick)
	p.X, p.Y = Bases["blue"].X, Bases["blue"].Y
	Step(r, 100_100, Tick)
	check(t, r.Scores["blue"] == 1 && r.MapID == "badlands", "capture scored")
	check(t, len(r.Wrecks) == 0, "wrecks cleared")
	for _, b := range r.Bridges {
		check(t, b.HP == b.MaxHP, "bridges restored")
	}
	for _, o := range r.Obstacles {
		if o.Kind == "building" {
			check(t, o.HP == o.MaxHP, "buildings restored")
		}
	}
}

func TestHullRelativeDriving(t *testing.T) {
	r := CreateRoom("HULL", "")
	p := AddPlayer(r, "pilot")
	clearTerrain(r)
	p.X, p.Y, p.BodyAngle = 600, 720, -math.Pi/4
	SetInput(p, input(msg{"dy": -1.0, "driveMode": "classic"}))
	runTicks(r, 36, 200_000)
	dx, dy := p.X-600, p.Y-720
	check(t, dx > 70 && dy < -70, "tank follows diagonal nose dx=%v dy=%v", dx, dy)
	check(t, math.Abs(dx+dy) < 40, "movement stays on hull axis")
	check(t, math.Abs(p.BodyAngle+math.Pi/4) < .05, "W does not yaw the hull")

	air := CreateRoom("NOSE", "")
	h := AddPlayer(air, "pilot")
	clearTerrain(air)
	h.Type, h.X, h.Y, h.BodyAngle, h.Fuel = "heli", 500, 700, 0, 100
	SetInput(h, input(msg{"dy": -1.0, "driveMode": "classic"}))
	runTicks(air, 40, 220_000)
	check(t, h.X > 680 && math.Abs(h.Y-700) < 12, "heli flies along its nose x=%v y=%v", h.X, h.Y)
	h.X, h.Y, h.VX, h.VY, h.BodyAngle = 500, 700, 0, 0, 0
	SetInput(h, input(msg{"dx": 1.0, "driveMode": "classic"}))
	runTicks(air, 40, 230_000)
	check(t, h.Y > 880 && math.Abs(h.X-500) < 20, "heli strafes right x=%v y=%v", h.X, h.Y)

	drones := CreateRoom("NOSED", "")
	a := AddPlayer(drones, "a")
	clearTerrain(drones)
	a.Type, a.X, a.Y, a.Ammo = "fpv", 400, 720, 5
	SetInput(a, input(msg{"aim": math.Pi, "fire": true, "driveMode": "classic"}))
	Step(drones, 240_000, Tick)
	check(t, len(drones.Drones) == 1, "drone launches")
	d := drones.Drones[0]
	x0, y0 := d.X, d.Y
	SetInput(a, input(msg{"dy": -1.0, "driveMode": "classic"}))
	runTicks(drones, 20, 240_040)
	check(t, d.X < x0-80 && math.Abs(d.Y-y0) < 30, "drone keeps its nose x=%v y=%v", d.X, d.Y)
}

func TestWeaponAiming(t *testing.T) {
	r := CreateRoom("AIM", "")
	jeep, tank, asv, victim := AddPlayer(r, "jeep"), AddPlayer(r, "tank"), AddPlayer(r, "asv"), AddPlayer(r, "victim")
	clearTerrain(r)
	jeep.Type, jeep.Ammo, jeep.Mines, jeep.X, jeep.Y = "jeep", 8, 6, 700, 700
	victim.X, victim.Y, victim.HP = 700, 860, 220
	hp := victim.HP
	SetInput(jeep, input(msg{"aim": math.Pi / 2, "fire": true, "targetX": 700.0, "targetY": 860.0}))
	Step(r, 500_000, Tick)
	check(t, victim.HP == hp, "grenade still in flight")
	check(t, len(r.Bullets) > 0 && r.Bullets[0].Kind == "grenade" && r.Bullets[0].TY > jeep.Y+100, "grenade thrown at the crosshair")
	Step(r, 500_900, Tick)
	check(t, victim.HP < hp, "grenade explodes at the aim point")

	tank.X, tank.Y, tank.Angle, tank.BodyAngle, tank.Ammo = 900, 400, 0, 0, 8
	SetInput(tank, input(msg{"aim": math.Pi / 2, "fire": true}))
	Step(r, 501_000, Tick)
	var shell *Bullet
	for _, b := range r.Bullets {
		if b.Kind == "tank" {
			shell = b
		}
	}
	check(t, shell != nil, "tank fires")
	check(t, math.Abs(math.Atan2(shell.VY, shell.VX)) < .25, "shell follows the turret, not the cursor")

	asv.Type, asv.X, asv.Y, asv.BodyAngle, asv.Angle, asv.Ammo, asv.HP = "asv", 1800, 200, math.Pi, 0, 8, 270
	SetInput(asv, input(msg{"fire": true}))
	Step(r, 502_000, Tick)
	var rocket *Bullet
	for _, b := range r.Bullets {
		if b.Kind == "asv" {
			rocket = b
		}
	}
	check(t, rocket != nil && rocket.VX < 0, "rocket leaves along the hull")
}

func TestDroneLinkRange(t *testing.T) {
	r := CreateRoom("RANGE", "")
	a := AddPlayer(r, "pilot")
	clearTerrain(r)
	a.Type, a.Ammo, a.X, a.Y = "fpv", 3, 400, 720
	SetInput(a, input(msg{"dx": 1.0, "fire": true, "driveMode": "vector"}))
	Step(r, 600_000, Tick)
	SetInput(a, input(msg{"dx": 1.0, "driveMode": "vector"}))
	runTicks(r, 90, 600_040)
	check(t, len(r.Drones) == 1, "drone keeps flying inside the link")
	d := r.Drones[0]
	check(t, math.Hypot(d.X-a.X, d.Y-a.Y) <= Types["fpv"].Range+.5, "drone held inside link")
	check(t, d.X > a.X+Types["fpv"].Range-8, "drone reaches link boundary")
}

func TestHiddenMines(t *testing.T) {
	r := CreateRoom("MINES", "")
	a, b := AddPlayer(r, "layer"), AddPlayer(r, "victim")
	clearTerrain(r)
	a.Type, a.Mines, a.X, a.Y, a.BodyAngle = "jeep", 4, 500, 700, 0
	SetInput(a, input(msg{"mine": true}))
	Step(r, 700_000, Tick)
	check(t, len(r.Mines) == 1 && a.Mines == 3, "mine laid")
	mine := r.Mines[0]
	check(t, len(TakeSnapshot(r, 700_000, a.Team).Mines) == 1, "own team sees the mine")
	check(t, len(TakeSnapshot(r, 700_000, b.Team).Mines) == 0, "enemy cannot see the mine")
	b.X, b.Y, b.HP = mine.X, mine.Y, 220
	hp := b.HP
	Step(r, 700_200, Tick)
	check(t, b.HP == hp, "mine not armed instantly")
	Step(r, 700_800, Tick)
	check(t, b.HP < hp && len(r.Mines) == 0, "enemy detonates the hidden mine")
}

func TestPartialMineStockCannotBeLaid(t *testing.T) {
	r := CreateRoom("STOCK", "")
	a := AddPlayer(r, "layer")
	clearTerrain(r)
	a.Type, a.Mines, a.X, a.Y = "jeep", .4, 900, 300
	SetInput(a, input(msg{"mine": true}))
	Step(r, 710_000, Tick)
	check(t, len(r.Mines) == 0 && a.Mines == .4, "a partly refilled mine stock is not a mine")
}

func TestBridgeCollapseSinksGroundNotHeli(t *testing.T) {
	r := CreateRoom("SINK", "")
	tank, heli := AddPlayer(r, "tank"), AddPlayer(r, "heli")
	clearTerrain(r)
	tank.Type, tank.X, tank.Y, tank.HP = "tank", 1130, 258, 130
	heli.Type, heli.X, heli.Y, heli.HP = "heli", 1210, 260, 125
	arty := AddPlayer(r, "artillery")
	arty.Type, arty.X, arty.Y, arty.Ammo, arty.Deploy = "arty", 820, 260, 12, Deployed
	r.Bridges[0].HP, r.Bridges[0].Stage = 95, 2
	SetInput(arty, input(msg{"fire": true, "targetX": 1180.0, "targetY": 255.0}))
	Step(r, 100_000, Tick)
	Step(r, 101_300, Tick)
	check(t, r.Bridges[0].HP == 0, "bridge collapses")
	check(t, !tank.Alive && heli.Alive, "tank sinks, heli survives")
	for _, w := range r.Wrecks {
		check(t, w.Type != "tank", "sunken tank leaves no wreck in the river")
	}
}

func TestArtilleryDeployShootPackCycle(t *testing.T) {
	r := CreateRoom("ARTY3", "")
	clearTerrain(r)
	p := AddPlayer(r, "a")
	p.Type, p.Ammo, p.X, p.Y, p.BodyAngle = "arty", 12, 600, 720, 0
	target := msg{"targetX": 1000.0, "targetY": 720.0}
	fire := func(on bool) msg {
		m := input(target)
		m["fire"] = on
		return m
	}
	now := 100_000.0
	SetInput(p, fire(true))
	Step(r, now, Tick)
	check(t, p.Deploy == Deploying && len(r.Strikes) == 0, "first click deploys instead of firing")
	SetInput(p, fire(false))
	Step(r, now+500, Tick)
	SetInput(p, fire(true))
	Step(r, now+600, Tick)
	check(t, len(r.Strikes) == 0, "cannot fire while still deploying")
	SetInput(p, fire(false))
	Step(r, now+ArtyDeployMs+10, Tick)
	check(t, p.Deploy == Deployed, "deployed after %v ms, got %q", ArtyDeployMs, p.Deploy)
	SetInput(p, fire(true))
	Step(r, now+ArtyDeployMs+50, Tick)
	check(t, len(r.Strikes) == 1, "second click fires")

	drive := input(msg{"dy": -1.0, "driveMode": "classic"})
	SetInput(p, drive)
	x := p.X
	begin := now + 4000
	runTicks(r, 30, begin)
	check(t, p.Deploy == Packing && math.Abs(p.X-x) < 1, "packing holds the gun in place, moved %.1f", p.X-x)
	runTicks(r, 45, begin+1000)
	check(t, p.Deploy == "" && p.X-x > 5, "drives away once packed, moved %.1f", p.X-x)

	SetInput(p, input(msg{"dy": -1.0, "driveMode": "classic", "fire": true}))
	Step(r, begin+3000, Tick)
	check(t, p.Deploy == Deploying, "fire while driving deploys again")
}

func TestVehicleLimitsAndRespawnChoice(t *testing.T) {
	r := CreateRoom("LIMIT", "")
	a, _, c := AddPlayer(r, "a"), AddPlayer(r, "b"), AddPlayer(r, "c")
	check(t, a.Team == c.Team, "a and c are teammates")
	check(t, a.Type == "tank" && c.Type == "jeep", "second teammate falls back to a jeep, got %s/%s", a.Type, c.Type)
	SetInput(c, msg{"type": "vehicle", "vehicle": "tank"})
	check(t, c.Type == "jeep", "cannot take a teammate's tank")
	SetInput(c, msg{"type": "vehicle", "vehicle": "heli"})
	check(t, c.Type == "heli", "free vehicle can be chosen at base")
	SetInput(a, msg{"type": "vehicle", "vehicle": "jeep"})
	SetInput(c, msg{"type": "vehicle", "vehicle": "jeep"})
	check(t, a.Type == "jeep" && c.Type == "jeep", "jeeps are unlimited")

	now := 100_000.0
	SelfDestruct(r, a, now)
	check(t, !a.Alive && a.RespawnAt == now+SelfDestructRespawnMs, "self-destruct waits %v ms", SelfDestructRespawnMs)
	SetInput(a, msg{"type": "vehicle", "vehicle": "arty"})
	check(t, a.NextType == "arty", "choice queued while waiting")
	Step(r, now+RespawnMs+100, Tick)
	check(t, !a.Alive, "still waiting after a normal respawn delay")
	Step(r, now+SelfDestructRespawnMs+10, Tick)
	check(t, a.Alive && a.Type == "arty", "respawns in the queued vehicle, got alive=%v %s", a.Alive, a.Type)
}

func TestJeepOffshoreCountdown(t *testing.T) {
	r := CreateRoom("OFFSH", "")
	clearTerrain(r)
	p := AddPlayer(r, "a")
	p.Type, p.X, p.Y, p.BodyAngle = "jeep", 900, 30, -math.Pi/2
	SetInput(p, input(msg{"dy": -1.0, "driveMode": "classic"}))
	now := 200_000.0
	for i := 0; i < 60 && p.Y >= 0; i++ {
		Step(r, now, Tick)
		now += 1000.0 / 30
	}
	check(t, p.Y < 0 && p.Alive, "jeep swims past the old edge, y=%v", p.Y)
	runTicks(r, 2, now)
	check(t, p.DrownAt > 0 && p.Alive, "countdown starts offshore")
	SetInput(p, input(msg{"dy": 1.0, "driveMode": "classic"}))
	check(t, !runUntilDeath(r, p, 90, now+100), "turning back in time survives")
	check(t, p.DrownAt == 0, "countdown clears back in safe water, y=%v", p.Y)
	p.X, p.Y = 900, -200
	SetInput(p, input(nil))
	check(t, runUntilDeath(r, p, int(OffshoreGraceMs/1000*30)+15, now+4000), "stays out too long and drowns")
}

func TestFlagSlowsCarrier(t *testing.T) {
	speeds := map[bool]float64{}
	for _, carrying := range []bool{false, true} {
		r := CreateRoom("SLOW", "")
		clearTerrain(r)
		p := AddPlayer(r, "a")
		p.Type, p.X, p.Y, p.BodyAngle = "jeep", 600, 720, 0
		if carrying {
			r.Flags["red"].CarriedBy = p.ID
		}
		SetInput(p, input(msg{"dy": -1.0, "driveMode": "classic"}))
		runTicks(r, 30, 200_000)
		speeds[carrying] = speedOf(p)
	}
	check(t, speeds[true] < speeds[false]*.9, "flag carrier is slower %v", speeds)
}

func TestGatesOpenOnlyForFriendlies(t *testing.T) {
	r := CreateRoom("GATES", "")
	r.Scenery, r.Turrets = nil, nil
	blue, red := AddPlayer(r, "blue"), AddPlayer(r, "red")
	check(t, blue.Team == "blue" && red.Team == "red", "teams")
	var gate *Object
	for _, o := range r.Obstacles {
		if o.Kind == "gate" && o.Team == "blue" && o.H > o.W {
			gate = o
		}
	}
	check(t, gate != nil, "blue HQ has an east gate")
	gy := gate.Y + gate.H/2
	for _, p := range []*Player{blue, red} {
		p.Type, p.X, p.Y, p.BodyAngle, p.VX, p.VY = "jeep", gate.X-60, gy, 0, 0, 0
		if p == red {
			p.X, p.BodyAngle = gate.X+gate.W+60, math.Pi
		}
	}
	blue.Y, red.Y = gy-30, gy+30
	SetInput(blue, input(msg{"dy": -1.0, "driveMode": "classic"}))
	SetInput(red, input(msg{"dy": -1.0, "driveMode": "classic"}))
	runTicks(r, 30, 200_000)
	check(t, blue.X > gate.X+gate.W, "blue jeep drives out through its own gate, x=%v gate=%v", blue.X, gate.X)
	check(t, red.X > gate.X+gate.W, "red jeep is stopped at the closed gate, x=%v gate=%v", red.X, gate.X)
}

func TestWallsBlockEnemyShotsButNotDefenders(t *testing.T) {
	r := CreateRoom("WALLS", "")
	r.Scenery, r.Turrets = nil, nil
	var wall *Object
	for _, o := range r.Obstacles {
		if o.Kind == "wall" && o.Team == "blue" && o.H > o.W && o.X < 100 {
			wall = o
		}
	}
	check(t, wall != nil, "blue HQ has a west wall")
	y := wall.Y + 60
	r.Bullets = []*Bullet{
		{ID: "own", Team: "blue", Kind: "tank", X: wall.X - 20, Y: y, VX: 630, Damage: 35, Radius: 5, EndAt: 1e12},
		{ID: "foe", Team: "red", Kind: "tank", X: wall.X - 20, Y: y + 40, VX: 630, Damage: 35, Radius: 5, EndAt: 1e12},
	}
	hp := wall.HP
	runTicks(r, 3, 200_000)
	check(t, wall.HP == hp-35, "only the enemy shell hits the wall, hp %v -> %v", hp, wall.HP)
	own := false
	for _, b := range r.Bullets {
		own = own || b.ID == "own"
	}
	check(t, own, "the defender's shell passes over its own wall")
}

func TestTurretLeadsMovingTarget(t *testing.T) {
	p := &Player{X: 400, Y: 0, VX: 0, VY: 200}
	a := leadAngle(0, 0, p, TurretShellSpeed)
	check(t, a > .05, "turret aims ahead of a crossing target, angle %v", a)
	still := &Player{X: 400, Y: 0}
	check(t, math.Abs(leadAngle(0, 0, still, TurretShellSpeed)) < 1e-9, "aims straight at a parked target")
}
