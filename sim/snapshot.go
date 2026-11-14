package sim

import "math"

type PlayerView struct {
	ID            string  `json:"id"`
	Team          string  `json:"team"`
	X             float64 `json:"x"`
	Y             float64 `json:"y"`
	Type          string  `json:"type"`
	Angle         float64 `json:"angle"`
	BodyAngle     float64 `json:"bodyAngle"`
	VX            float64 `json:"vx"`
	VY            float64 `json:"vy"`
	Surface       string  `json:"surface"`
	HP            float64 `json:"hp"`
	Ammo          float64 `json:"ammo"`
	Mines         float64 `json:"mines"`
	Fuel          float64 `json:"fuel"`
	Alive         bool    `json:"alive"`
	RespawnAt     float64 `json:"respawnAt"`
	Deploy        string  `json:"deploy,omitempty"`
	DeployUntil   float64 `json:"deployUntil,omitempty"`
	DeployedSince float64 `json:"deployedSince,omitempty"`
	NextType      string  `json:"nextType,omitempty"`
	DrownAt       float64 `json:"drownAt,omitempty"`
}

type BulletView struct {
	ID       string  `json:"id"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Team     string  `json:"team"`
	Kind     string  `json:"kind"`
	VX       float64 `json:"vx"`
	VY       float64 `json:"vy"`
	BornAt   float64 `json:"bornAt,omitempty"`
	ImpactAt float64 `json:"impactAt,omitempty"`
}

type MineView struct {
	ID   string  `json:"id"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Team string  `json:"team"`
}

type Snapshot struct {
	Type         string           `json:"type"`
	Time         float64          `json:"time"`
	Scores       map[string]int   `json:"scores"`
	Flags        map[string]*Flag `json:"flags"`
	Turrets      []*Turret        `json:"turrets"`
	MapID        string           `json:"mapId"`
	Bridges      []*Object        `json:"bridges"`
	Wrecks       []*Object        `json:"wrecks"`
	Obstacles    []*Object        `json:"obstacles"`
	Scenery      []*Object        `json:"scenery"`
	Trails       []Trail          `json:"trails"`
	Strikes      []Strike         `json:"strikes"`
	Drones       []*Drone         `json:"drones"`
	Craters      []Crater         `json:"craters"`
	Mines        []MineView       `json:"mines"`
	Bullets      []BulletView     `json:"bullets"`
	Explosions   []Explosion      `json:"explosions"`
	Announcement string           `json:"announcement"`
	Players      []PlayerView     `json:"players"`
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// TakeSnapshot builds the state one viewer may see. viewerTeam "" reveals every mine.
func TakeSnapshot(r *Room, now float64, viewerTeam string) Snapshot {
	s := Snapshot{
		Type: "state", Time: now, Scores: r.Scores, Flags: r.Flags, Turrets: nonNil(r.Turrets),
		MapID: r.MapID, Bridges: nonNil(r.Bridges), Wrecks: nonNil(r.Wrecks),
		Obstacles: nonNil(r.Obstacles), Scenery: nonNil(r.Scenery), Trails: nonNil(r.Trails),
		Strikes: nonNil(r.Strikes), Drones: nonNil(r.Drones), Craters: nonNil(r.Craters),
		Explosions: nonNil(r.Explosions), Mines: []MineView{}, Bullets: []BulletView{}, Players: []PlayerView{},
	}
	for _, m := range r.Mines {
		if viewerTeam == "" || m.Team == viewerTeam {
			s.Mines = append(s.Mines, MineView{m.ID, m.X, m.Y, m.Team})
		}
	}
	for _, b := range r.Bullets {
		s.Bullets = append(s.Bullets, BulletView{b.ID, b.X, b.Y, b.Team, b.Kind, b.VX, b.VY, b.BornAt, b.ImpactAt})
	}
	if r.AnnouncementUntil > now {
		s.Announcement = r.Announcement
	}
	for _, p := range r.Players {
		s.Players = append(s.Players, PlayerView{p.ID, p.Team, p.X, p.Y, p.Type, p.Angle, p.BodyAngle,
			p.VX, p.VY, p.Surface, p.HP, p.Ammo, math.Floor(p.Mines), p.Fuel, p.Alive, p.RespawnAt,
			p.Deploy, p.DeployUntil, p.DeployedSince, p.NextType, p.DrownAt})
	}
	return s
}

type World struct {
	Width      float64                 `json:"width"`
	Height     float64                 `json:"height"`
	Bases      map[string]Point        `json:"bases"`
	MapID      string                  `json:"mapId"`
	MapName    string                  `json:"mapName"`
	Biome      string                  `json:"biome"`
	MapChoices []MapChoice             `json:"mapChoices"`
	Water      []Rect                  `json:"water"`
	Coast      []Point                 `json:"coast"`
	Mud        []Ellipse               `json:"mud"`
	Roads      []Rect                  `json:"roads"`
	Cover      []Rect                  `json:"cover"`
	Bridges    []BridgeDef             `json:"bridges"`
	Types      map[string]*VehicleType `json:"types"`
	Limits     map[string]int          `json:"limits"`
	SeaMargin  float64                 `json:"seaMargin"`
}

func WorldFor(r *Room) World {
	m := r.Map
	return World{Width: Width, Height: Height, Bases: Bases, MapID: r.MapID, MapName: m.Name, Biome: m.Biome,
		MapChoices: MapChoices, Water: m.Water, Coast: m.Coast, Mud: m.Mud, Roads: m.Roads, Cover: m.Cover, Bridges: m.Bridges, Types: Types,
		Limits: VehicleLimits, SeaMargin: SeaMargin}
}
