use crate::config::*;
use crate::HeightGenerator;

fn stack(amplitude: f64, noise_scale: f64, seed_salt: f64) -> Octaves {
    Octaves {
        amplitude,
        noise_scale,
        octaves: 5.0,
        persistence: 0.5,
        lacunarity: 2.0,
        curve_exp: 1.5,
        seed_salt,
    }
}

fn biome(name: &str, deformations: Vec<Deformation>, erosion: Option<Erosion>) -> Biome {
    Biome { name: name.into(), deformations, erosion, layers: Vec::new(), scatter: Vec::new() }
}

/// Two biomes split by temperature, every deformation kind, erosion and a
/// continent, at scales small enough that one chunk crosses all of them.
fn climate(erosion: bool) -> ClimateConfig {
    let plain = biome("plain", vec![Deformation::Fbm(stack(20.0, 60.0, 0.0))], None);
    let mountain = biome(
        "mountain",
        vec![
            Deformation::Eroded(Eroded { stack: stack(120.0, 90.0, 0.0), erosion: 1.0 }),
            Deformation::Ridged(Ridged { stack: stack(60.0, 40.0, 7.0), sharpness: 2.0 }),
            Deformation::Terrace(Terrace { stack: stack(30.0, 70.0, 9.0), steps: 5.0, sharpness: 0.6 }),
            Deformation::Dunes(Dunes {
                amplitude: 4.0,
                wavelength: 12.0,
                angle_deg: 30.0,
                warp: 0.5,
                warp_scale: 40.0,
                sharpness: 0.5,
                seed_salt: 3.0,
            }),
        ],
        erosion.then_some(Erosion { iterations: 6.0, talus_deg: 30.0, strength: 0.5 }),
    );
    ClimateConfig {
        temperature: ClimateAxis { scale: 150.0, seed_salt: 11.0, cuts: vec![0.5], blend_half_width: 0.1 },
        moisture: ClimateAxis { scale: 150.0, seed_salt: 13.0, cuts: vec![], blend_half_width: 0.1 },
        continent: Some(ContinentConfig {
            scale: 300.0,
            seed_salt: 17.0,
            coast: 0.45,
            blend_half_width: 0.03,
            shelf_width: 0.05,
            shelf_depth: 8.0,
            slope_width: 0.1,
            ocean_depth: 60.0,
            coastal_moisture: Some(0.1),
            coastal_moisture_reach: Some(0.1),
        }),
        coast: None,
        water: Vec::new(),
        lakes: None,
        biomes: vec![plain, mountain],
        cells: vec![vec![0], vec![1]],
    }
}

fn generator(erosion: bool) -> HeightGenerator {
    HeightGenerator::new(climate(erosion), 4321.0, 2.0, 2.0).unwrap()
}

const SIZE: usize = 65;

#[test]
fn is_deterministic() {
    let a = generator(true).generate(SIZE, SIZE, 128.0, -64.0);
    let b = generator(true).generate(SIZE, SIZE, 128.0, -64.0);
    assert_eq!(a, b);
}

#[test]
fn shares_exact_edges_with_its_neighbours() {
    let g = generator(true);
    let step = (SIZE - 1) as f64;
    for (ox, oy) in [(0.0, 0.0), (448.0, -320.0), (-2048.0, 1024.0)] {
        let here = g.generate(SIZE, SIZE, ox, oy);
        let east = g.generate(SIZE, SIZE, ox + step, oy);
        let north = g.generate(SIZE, SIZE, ox, oy + step);
        for k in 0..SIZE {
            assert_eq!(here[SIZE - 1 + k * SIZE], east[k * SIZE], "east edge at {ox},{oy} row {k}");
            assert_eq!(here[k], north[k + (SIZE - 1) * SIZE], "north edge at {ox},{oy} column {k}");
        }
    }
}

#[test]
fn erodes_without_changing_the_field_size() {
    let g = generator(true);
    let eroded = g.generate(SIZE, SIZE, 0.0, 0.0);
    let raw = generator(false).generate(SIZE, SIZE, 0.0, 0.0);
    assert_eq!(eroded.len(), SIZE * SIZE);
    assert_ne!(eroded, raw);
}

#[test]
fn skips_erosion_only_where_it_would_move_nothing() {
    let mut c = super::tests::lakes::lake_climate();
    c.lakes = None;
    c.biomes[1].erosion = Some(Erosion { iterations: 6.0, talus_deg: 30.0, strength: 0.5 });
    let g = HeightGenerator::new(c, 9001.0, 0.0, 2.0).unwrap();
    let step = (SIZE - 1) as f64;
    let (mut skipped, mut eroded) = (0, 0);
    for j in -6..6 {
        for i in -6..6 {
            let (ox, oy) = (i as f64 * step * 3.0, j as f64 * step * 3.0);
            let grid = g.eroded_grid(SIZE, SIZE, ox, oy);
            if g.erodes_within(&grid) {
                eroded += 1;
            } else {
                skipped += 1;
            }
            assert_eq!(g.generate(SIZE, SIZE, ox, oy), g.generate_on(&grid, SIZE, SIZE, ox, oy, true));
        }
    }
    assert!(skipped > 0 && eroded > 0, "{skipped} skipped, {eroded} eroded");
}

#[test]
fn samples_the_ground_it_generates() {
    let g = generator(false);
    let (ox, oy) = (300.0, -200.0);
    let field = g.generate(SIZE, SIZE, ox, oy);
    for (i, j) in [(0, 0), (17, 40), (64, 64)] {
        let x = i as f64 - SIZE as f64 / 2.0 + ox;
        let y = j as f64 - SIZE as f64 / 2.0 - oy;
        assert_eq!(field[i + j * SIZE], g.sample(x, y).height as f32);
    }
}

#[test]
fn lowers_open_ocean_onto_the_sea_bed() {
    let g = generator(false);
    let mut found = false;
    for k in 0..400 {
        let (x, y) = (k as f64 * 37.0, k as f64 * -23.0);
        if g.continent(x, y) < 0.3 {
            found = true;
            assert!(g.sample(x, y).height < 2.0 - 8.0);
        }
    }
    assert!(found, "no open ocean sampled");
}

fn rejection(c: ClimateConfig) -> String {
    HeightGenerator::new(c, 1.0, 0.0, 2.0).err().expect("preset was accepted")
}

#[test]
fn rejects_bad_presets() {
    let mut c = climate(true);
    c.cells = vec![vec![0]];
    assert!(rejection(c).contains("temperature rows"));

    let mut c = climate(true);
    c.cells[1][0] = 5;
    assert!(rejection(c).contains("out of range"));

    let mut c = climate(true);
    c.biomes[1].erosion.as_mut().unwrap().iterations = 49.0;
    assert!(rejection(c).contains("iterations"));
}

#[test]
fn interpolates_climate_close_to_the_exact_fields() {
    use crate::climate::ClimateField;
    use math::Simplex;
    // The default preset's scales; the other tests shrink them to fit a chunk.
    let mut c = climate(false);
    c.temperature.scale = 1500.0;
    c.moisture.scale = 1200.0;
    c.continent.as_mut().unwrap().scale = 4500.0;
    let simplex = Simplex::new(4321.0);
    let field = ClimateField::new(4321.0, &c);
    let mut worst: f64 = 0.0;
    for k in 0..2000 {
        let (x, y) = (k as f64 * 13.7 - 9000.0, k as f64 * -7.3 + 4000.0);
        let (a, b) = (field.sample(&c, &simplex, x, y), field.exact(&c, &simplex, x, y));
        worst = worst
            .max((a.temperature - b.temperature).abs())
            .max((a.continent - b.continent).abs());
    }
    // Coast and biome blends span 0.03 and more of these fields.
    assert!(worst < 1e-3, "worst climate error {worst}");
}

mod splat {
    use super::*;
    use crate::{PaintMask, Region, SplatGenerator, SplatSpec};

    fn layer(material: &str, slope: Option<Band>, height: Option<Band>, noise: Option<NoiseSelector>) -> Layer {
        Layer { material: material.into(), slope: slope.map(Selector::One), height: height.map(Selector::One), noise }
    }

    /// The heights climate with layers, noise patches and a coast.
    fn surfaced() -> ClimateConfig {
        let mut c = climate(false);
        c.biomes[0].layers = vec![
            layer("grass", None, None, None),
            layer("rock", Some(Band { from: 20.0, to: 40.0 }), None, None),
        ];
        c.biomes[1].layers = vec![
            layer("rock", None, None, None),
            layer(
                "snow",
                None,
                Some(Band { from: 80.0, to: 120.0 }),
                Some(NoiseSelector { scale: 30.0, seed_salt: 5.0, band: Band { from: 0.3, to: 0.6 } }),
            ),
        ];
        c.coast = Some(CoastConfig {
            beach_height: 3.0,
            wet_height: 0.5,
            seabed_depth: 2.0,
            blend: 1.0,
            slope: Band { from: 30.0, to: 15.0 },
        });
        c
    }

    fn spec() -> SplatSpec {
        SplatSpec {
            palette: ["grass", "rock", "snow", "sand", "wet", "seabed"].map(String::from).to_vec(),
            coast_materials: ["sand", "wet", "seabed"].map(String::from).to_vec(),
        }
    }

    fn generator() -> SplatGenerator {
        SplatGenerator::new(surfaced(), &spec(), 4321.0, 2.0, 2.0).unwrap()
    }

    fn whole() -> Region {
        Region { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 }
    }

    fn splat(g: &SplatGenerator, heights: &[f32], mask: Option<&PaintMask>, region: Region, out: &mut [u8]) {
        g.generate(heights, SIZE, SIZE, 128.0, -64.0, mask, region, out);
    }

    fn heights() -> Vec<f32> {
        HeightGenerator::new(surfaced(), 4321.0, 2.0, 2.0).unwrap().generate(SIZE, SIZE, 128.0, -64.0)
    }

    fn channel_sum(out: &[u8], texel: usize) -> u32 {
        let plane = SIZE * SIZE * 4;
        (0..4).map(|c| out[texel * 4 + c] as u32 + out[plane + texel * 4 + c] as u32).sum()
    }

    #[test]
    fn sums_to_one_at_every_texel() {
        let mut out = vec![0u8; SIZE * SIZE * 8];
        splat(&generator(), &heights(), None, whole(), &mut out);
        for texel in 0..SIZE * SIZE {
            let sum = channel_sum(&out, texel);
            assert!((251..=259).contains(&sum), "texel {texel} sums to {sum}");
        }
    }

    #[test]
    fn uses_more_than_one_material() {
        let mut out = vec![0u8; SIZE * SIZE * 8];
        splat(&generator(), &heights(), None, whole(), &mut out);
        let plane = SIZE * SIZE * 4;
        let used = (0..6).filter(|&c| (0..SIZE * SIZE).any(|t| out[(c / 4) * plane + t * 4 + c % 4] > 0)).count();
        assert!(used >= 3, "only {used} materials used");
    }

    #[test]
    fn leaves_texels_outside_the_region_alone() {
        let mut out = vec![7u8; SIZE * SIZE * 8];
        let region = Region { x0: 10, y0: 20, x1: 30, y1: 25 };
        splat(&generator(), &heights(), None, region, &mut out);
        for y in 0..SIZE {
            for x in 0..SIZE {
                let inside = (10..=30).contains(&x) && (20..=25).contains(&y);
                assert_eq!(channel_sum(&out, x + y * SIZE) == 7 * 8, !inside, "texel {x},{y}");
            }
        }
    }

    #[test]
    fn saturated_paint_replaces_the_climate() {
        // Every texel painted fully as the mountain (biome 1), whose base is rock.
        let size = (SIZE - 1) / 4 + 1;
        let mut weights = vec![0u8; size * size * 2];
        weights[size * size..].fill(255);
        let mask = PaintMask { size, step: 4.0, channels: 2, weights: &weights };
        // Above the beach and below the snow line.
        let flat = vec![50.0f32; SIZE * SIZE];
        let mut out = vec![0u8; SIZE * SIZE * 8];
        splat(&generator(), &flat, Some(&mask), whole(), &mut out);
        for texel in 0..SIZE * SIZE {
            assert_eq!(out[texel * 4 + 1], 255, "texel {texel} is not rock");
        }
    }

    #[test]
    fn rejects_a_material_missing_from_the_palette() {
        let mut s = spec();
        s.palette.retain(|m| m != "snow");
        let err = SplatGenerator::new(surfaced(), &s, 1.0, 0.0, 2.0).err().expect("accepted");
        assert!(err.contains("snow"));
    }

    mod layers {
        use super::*;
        use crate::splat::layer_weights;

        fn weights(layers: &[Layer], height: f64, slope: f64, noise: f64) -> Vec<f64> {
            let mut out = vec![0.0; layers.len()];
            layer_weights(layers, height, slope, |_| noise, &mut out);
            out
        }

        /// Dirt, then rock on steep ground, then snow up high that slides off
        /// cliffs (an inverted slope band).
        fn mountain() -> Vec<Layer> {
            vec![
                layer("dirt", None, None, None),
                layer("rock", Some(Band { from: 30.0, to: 45.0 }), None, None),
                layer("snow", Some(Band { from: 40.0, to: 25.0 }), Some(Band { from: 100.0, to: 130.0 }), None),
            ]
        }

        fn mottled(band: Band) -> Vec<Layer> {
            vec![
                layer("base", None, None, None),
                layer("patch", None, None, Some(NoiseSelector { scale: 20.0, seed_salt: 11.0, band })),
            ]
        }

        #[test]
        fn gives_a_single_layer_all_the_weight() {
            let solo = [layer("only", None, None, None)];
            assert_eq!(weights(&solo, 0.0, 0.0, 0.0), [1.0]);
            assert_eq!(weights(&solo, 500.0, 89.0, 0.0), [1.0]);
        }

        #[test]
        fn sums_to_one_and_never_goes_negative() {
            for h in (0..=200).step_by(10) {
                for s in (0..=90).step_by(5) {
                    let w = weights(&mountain(), h as f64, s as f64, 0.0);
                    assert!((w.iter().sum::<f64>() - 1.0).abs() < 1e-10);
                    assert!(w.iter().all(|&v| v >= 0.0), "{w:?} at {h} m, {s}°");
                }
            }
        }

        #[test]
        fn lets_a_partial_top_layer_reveal_what_is_beneath() {
            // High, but too steep for snow: the rock beneath takes it all.
            assert_eq!(weights(&mountain(), 150.0, 60.0, 0.0), [0.0, 1.0, 0.0]);
            assert_eq!(weights(&mountain(), 150.0, 0.0, 0.0), [0.0, 0.0, 1.0]);
        }

        #[test]
        fn buries_lower_layers_under_a_selectorless_layer() {
            let plain = |names: &[&str]| names.iter().map(|n| layer(n, None, None, None)).collect::<Vec<_>>();
            assert_eq!(weights(&plain(&["a", "b"]), 50.0, 20.0, 0.0), [0.0, 1.0]);
            assert_eq!(weights(&plain(&["a", "b", "c"]), 50.0, 20.0, 0.0), [0.0, 0.0, 1.0]);
        }

        #[test]
        fn splits_and_ramps_by_noise() {
            let biome = mottled(Band { from: 0.45, to: 0.55 });
            assert_eq!(weights(&biome, 50.0, 20.0, 0.2), [1.0, 0.0]);
            assert_eq!(weights(&biome, 50.0, 20.0, 0.8), [0.0, 1.0]);
            assert!((weights(&biome, 50.0, 20.0, 0.5)[1] - 0.5).abs() < 1e-9);
        }

        #[test]
        fn inverts_with_the_band() {
            let inverted = mottled(Band { from: 0.55, to: 0.45 });
            assert_eq!(weights(&inverted, 50.0, 20.0, 0.8)[1], 0.0);
            assert_eq!(weights(&inverted, 50.0, 20.0, 0.2)[1], 1.0);
        }

        #[test]
        fn multiplies_noise_with_the_other_selectors() {
            let mut biome = mottled(Band { from: 0.45, to: 0.55 });
            biome[1].slope = Some(Selector::One(Band { from: 10.0, to: 20.0 }));
            assert_eq!(weights(&biome, 50.0, 0.0, 0.8), [1.0, 0.0]);
            assert_eq!(weights(&biome, 50.0, 30.0, 0.2), [1.0, 0.0]);
            assert_eq!(weights(&biome, 50.0, 30.0, 0.8), [0.0, 1.0]);
        }

        #[test]
        fn multiplies_several_bands_into_a_plateau() {
            let mut biome = vec![layer("base", None, None, None), layer("band", None, None, None)];
            biome[1].height = Some(Selector::All(vec![Band { from: 10.0, to: 20.0 }, Band { from: 60.0, to: 50.0 }]));
            assert_eq!(weights(&biome, 35.0, 0.0, 0.0), [0.0, 1.0]);
            assert_eq!(weights(&biome, 5.0, 0.0, 0.0), [1.0, 0.0]);
            assert_eq!(weights(&biome, 70.0, 0.0, 0.0), [1.0, 0.0]);
        }

        #[test]
        fn leaves_entries_past_the_layer_count_alone() {
            let mut out = [-1.0; 4];
            layer_weights(&[layer("only", None, None, None)], 0.0, 0.0, |_| 0.0, &mut out);
            assert_eq!(out, [1.0, -1.0, -1.0, -1.0]);
        }
    }
}

mod lakes {
    use super::*;
    use crate::{Lake, Lakes};

    pub fn lake_config() -> LakeConfig {
        LakeConfig {
            cell_size: 400.0,
            seed_salt: 70001.0,
            chance: 1.0,
            radius: Band { from: 15.0, to: 30.0 },
            irregularity: 0.25,
            bank: 1.8,
            depth: Band { from: 3.0, to: 8.0 },
            margin: 1.0,
            max_rim_slope: 8.0,
            max_lagoon_slope: 25.0,
            lagoon_chance: 0.8,
            lagoon_radius: Band { from: 30.0, to: 50.0 },
            moraine: 1.0,
            spacing: 10.0,
            tarns: Some(TarnConfig { radius: Band { from: 6.0, to: 12.0 }, max_rim_slope: 50.0, lip_share: 0.2 }),
        }
    }

    /// Gentle plains for lakes, steep mountains for tarns, and a coast for
    /// lagoons, at scales a few lake cells cross.
    pub fn lake_climate() -> ClimateConfig {
        let plain = biome("plain", vec![Deformation::Fbm(stack(12.0, 400.0, 0.0))], None);
        let mountain =
            biome("mountain", vec![Deformation::Ridged(Ridged { stack: stack(160.0, 160.0, 7.0), sharpness: 2.0 })], None);
        let mut c = climate(false);
        c.temperature = ClimateAxis { scale: 900.0, seed_salt: 11.0, cuts: vec![0.6], blend_half_width: 0.05 };
        if let Some(continent) = c.continent.as_mut() {
            continent.scale = 2400.0;
            continent.coast = 0.4;
        }
        c.biomes = vec![plain, mountain];
        c.water = vec![WaterType { name: "ocean".into() }, WaterType { name: "lake".into() }];
        c.lakes = Some(lake_config());
        c
    }

    pub fn ground(c: ClimateConfig) -> HeightGenerator {
        HeightGenerator::new(c, 9001.0, 0.0, 2.0).unwrap()
    }

    pub const AREA: f64 = 400.0 * 6.0;

    fn lakes_in(g: &HeightGenerator) -> Vec<Lake> {
        Lakes::of(g).map_or_else(Vec::new, |l| l.find(-AREA, -AREA, AREA, AREA))
    }

    fn with_lakes(edit: impl FnOnce(&mut LakeConfig)) -> HeightGenerator {
        let mut c = lake_climate();
        edit(c.lakes.as_mut().unwrap());
        ground(c)
    }

    fn rim_ground(g: &HeightGenerator, lake: &Lake, angle: f64, d: f64) -> (f64, f64, f64) {
        let (u, v) = along(lake, angle, d);
        (u, v, g.sample(u, v).height)
    }

    /// The point `d` shore radii from the centre toward `angle`.
    pub fn along(lake: &Lake, angle: f64, d: f64) -> (f64, f64) {
        let unit = lake.distance(lake.u + angle.cos(), lake.v + angle.sin());
        (lake.u + angle.cos() * d / unit, lake.v + angle.sin() * d / unit)
    }

    fn angles(n: usize) -> impl Iterator<Item = f64> {
        (0..n).map(move |k| k as f64 / n as f64 * std::f64::consts::TAU)
    }

    #[test]
    fn finds_the_same_lakes_from_any_box_they_reach() {
        let g = ground(lake_climate());
        let lakes = lakes_in(&g);
        assert!(lakes.len() > 10);
        // Debug, as a lake's mouth is NaN.
        assert_eq!(format!("{:?}", lakes_in(&g)), format!("{lakes:?}"));
        let finder = Lakes::of(&g).unwrap();
        for lake in lakes.iter().take(5) {
            let found = finder.find(lake.u, lake.v, lake.u + 1.0, lake.v + 1.0);
            assert_eq!(found.iter().map(|l| l.body_id).collect::<Vec<_>>(), vec![lake.body_id]);
        }
    }

    #[test]
    fn keeps_neighbouring_lakes_a_shore_apart() {
        let lakes = lakes_in(&ground(lake_climate()));
        for (i, a) in lakes.iter().enumerate() {
            for b in &lakes[i + 1..] {
                let gap = (a.u - b.u).hypot(a.v - b.v) - a.reach - b.reach;
                assert!(gap >= lake_config().spacing, "{gap}");
            }
        }
    }

    #[test]
    fn levels_each_lake_below_every_rim_sample() {
        let g = ground(lake_climate());
        for lake in lakes_in(&g).iter().filter(|l| !l.tarn && !l.lagoon) {
            for angle in angles(24) {
                let (_, _, h) = rim_ground(&g, lake, angle, lake.bank);
                assert!(h >= lake.level + lake_config().margin - 1e-6);
            }
        }
    }

    #[test]
    fn holds_every_lake_in_behind_its_bank() {
        let g = ground(lake_climate());
        for lake in lakes_in(&g).iter().filter(|l| !l.lagoon) {
            for angle in angles(48) {
                for d in [1.2, 1.5, lake.bank] {
                    let (u, v, h) = rim_ground(&g, lake, angle, d);
                    assert!(lake.carve(u, v, h) >= lake.level - 1e-3);
                }
                let (u, v, h) = rim_ground(&g, lake, angle, lake.bank);
                assert!(lake.carve(u, v, h) >= lake.lip - 1e-3);
            }
        }
    }

    #[test]
    fn settles_tarns_part_way_up_a_steep_rim() {
        let g = ground(lake_climate());
        let lakes = lakes_in(&g);
        let tarns: Vec<_> = lakes.iter().filter(|l| l.tarn).collect();
        assert!(!tarns.is_empty());
        for tarn in tarns {
            let lowest = angles(24).map(|a| rim_ground(&g, tarn, a, tarn.bank).2).fold(f64::INFINITY, f64::min);
            assert!(tarn.level >= lowest - 1e-6);
            assert!(tarn.radius < lake_config().radius.from);
        }
    }

    #[test]
    fn gives_every_lake_its_own_body() {
        let lakes = lakes_in(&ground(lake_climate()));
        let mut ids: Vec<_> = lakes.iter().map(|l| l.body_id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), lakes.len());
        assert!(!ids.contains(&crate::lakes::OCEAN_BODY_ID));
    }

    #[test]
    fn makes_no_lakes_under_the_ocean_or_without_a_lake_config() {
        let mut ocean = lake_climate();
        ocean.continent.as_mut().unwrap().coast = 2.0;
        assert!(lakes_in(&ground(ocean)).is_empty());
        let mut none = lake_climate();
        none.lakes = None;
        assert!(Lakes::of(&ground(none)).is_none());
    }

    #[test]
    fn rejects_every_dry_site_when_no_rim_may_vary() {
        let g = with_lakes(|l| {
            l.max_rim_slope = 0.0;
            l.tarns = None;
        });
        assert!(lakes_in(&g).iter().all(|l| l.lagoon));
    }

    #[test]
    fn tries_a_tarn_only_where_a_lake_is_too_steep() {
        let g = with_lakes(|l| {
            l.max_rim_slope = 0.0;
            l.lagoon_chance = 0.0;
        });
        let lakes = lakes_in(&g);
        assert!(!lakes.is_empty());
        assert!(lakes.iter().all(|l| l.tarn || l.lagoon));
        assert!(lakes.iter().any(|l| l.tarn));
    }

    #[test]
    fn digs_the_bed_to_its_depth_and_meets_the_level_at_the_shore() {
        let lakes = lakes_in(&ground(lake_climate()));
        let lake = lakes.iter().find(|l| !l.tarn && !l.lagoon).unwrap();
        assert!((lake.carve(lake.u, lake.v, 500.0) - (lake.level - lake.depth)).abs() < 1e-6);
        assert_eq!(lake.carve(lake.u + lake.reach + 1.0, lake.v, 500.0), 500.0);
        let (u, v) = along(lake, 0.3, 1.0);
        assert!((lake.carve(u, v, 500.0) - lake.level).abs() < 1e-3);
    }

    #[test]
    fn reports_every_cell_and_settles_the_lakes_find_finds() {
        let g = ground(lake_climate());
        let lakes = Lakes::of(&g).unwrap();
        let size = lake_config().cell_size;
        let reports = lakes.inspect(0.0, 0.0, size * 3.0 - 1.0, size * 3.0 - 1.0);
        assert_eq!(reports.len(), 9);
        let mut settled: Vec<_> = reports.iter().filter_map(|r| r.lake.as_ref().map(|l| l.body_id)).collect();
        let mut found: Vec<_> = lakes
            .find(0.0, 0.0, size * 3.0 - 1.0, size * 3.0 - 1.0)
            .iter()
            .filter(|l| (0..3).contains(&l.cell_x) && (0..3).contains(&l.cell_y))
            .map(|l| l.body_id)
            .collect();
        settled.sort();
        found.sort();
        assert_eq!(settled, found);
        for r in &reports {
            use crate::lakes::Outcome;
            let settles = matches!(r.outcome, Outcome::Lake | Outcome::Tarn | Outcome::Lagoon);
            assert_eq!(settles, r.lake.is_some());
        }
    }

    #[test]
    fn carves_chunks_that_meet_exactly() {
        let g = ground(lake_climate());
        let lakes = lakes_in(&g);
        let lake = lakes.iter().find(|l| !l.tarn && !l.lagoon).unwrap();
        let (ox, oy) = (lake.u.round(), -lake.v.round());
        let carved = |ox: f64, oy: f64| {
            let mut h = g.generate(SIZE, SIZE, ox, oy);
            Lakes::of(&g).unwrap().carve(&mut h, SIZE, SIZE, ox, oy);
            h
        };
        let centre = carved(ox, oy);
        let mid = (SIZE - 1) / 2;
        assert!((centre[mid + mid * SIZE] as f64) < lake.level);
        let step = (SIZE - 1) as f64;
        let right = carved(ox + step, oy);
        let below = carved(ox, oy - step);
        for i in 0..SIZE {
            assert_eq!(right[i * SIZE], centre[SIZE - 1 + i * SIZE]);
            assert_eq!(below[i], centre[i + (SIZE - 1) * SIZE]);
        }
    }

    mod lagoons {
        use super::*;

        #[test]
        fn open_to_the_sea_at_sea_level() {
            let g = ground(lake_climate());
            let lakes = lakes_in(&g);
            let lagoons: Vec<_> = lakes.iter().filter(|l| l.lagoon).collect();
            assert!(!lagoons.is_empty());
            for l in lagoons {
                assert_eq!((l.level, l.spill_height, l.tarn), (0.0, 0.0, false));
                assert_eq!(l.carve(l.u + l.reach * 0.99, l.v, -3.0), -3.0);
                assert!(!l.mouth.is_nan());
            }
        }

        #[test]
        fn open_only_where_the_sea_stands_on_the_rim() {
            let g = ground(lake_climate());
            let continent = g.climate().continent.clone().unwrap();
            for lake in lakes_in(&g) {
                let sea = angles(24).any(|a| {
                    let (u, v) = along(&lake, a, lake.bank);
                    let s = g.sample(u, v);
                    s.height < 0.0 && crate::climate::ocean_coverage(&continent, s.continent) > 0.0
                });
                assert_eq!(lake.lagoon, sea);
            }
        }

        #[test]
        fn cut_a_mouth_below_sea_level_from_the_shore_to_the_sea() {
            let g = ground(lake_climate());
            for l in lakes_in(&g).iter().filter(|l| l.lagoon) {
                let mut d = 1.0;
                while d <= l.bank {
                    let (u, v, h) = rim_ground(&g, l, l.mouth, d);
                    assert!(l.carve(u, v, h) < 0.0);
                    d += 0.05;
                }
            }
        }

        #[test]
        fn settle_no_lake_out_at_sea() {
            let g = ground(lake_climate());
            for lake in lakes_in(&g) {
                if g.sample(lake.u, lake.v).height < 0.0 {
                    assert!(lake.lagoon);
                }
            }
        }
    }
}

mod water {
    use super::lakes::{along, ground, lake_climate, AREA};
    use super::*;
    use crate::water::{build_map, resolve, to_f16, WaterEdit, WaterPoint, EDIT_CHANNELS, SWASH_REACH, WET_BAND_REACH};
    use crate::{Lake, Lakes};

    const CHUNK: usize = 65;
    const STEP: usize = 4;
    const TEXELS: usize = (CHUNK - 1) / STEP + 1;

    fn with_coast(coast: f64) -> HeightGenerator {
        let mut c = lake_climate();
        c.continent.as_mut().unwrap().coast = coast;
        c.lakes = None;
        ground(c)
    }

    fn flat(height: f32) -> Vec<f32> {
        vec![height; CHUNK * CHUNK]
    }

    fn from_f16(half: u16) -> f64 {
        let sign = if half & 0x8000 != 0 { -1.0 } else { 1.0 };
        let exponent = ((half >> 10) & 0x1f) as i32;
        let mantissa = (half & 0x3ff) as f64;
        if exponent == 0 {
            return sign * mantissa * 2f64.powi(-24);
        }
        sign * (1.0 + mantissa / 1024.0) * 2f64.powi(exponent - 15)
    }

    #[test]
    fn rounds_to_half_precision_as_the_ts_does() {
        // toFloat16 in float16.ts.
        assert_eq!(to_f16(0.0), 0);
        assert_eq!(to_f16(1.0), 0x3c00);
        assert_eq!(to_f16(-2.5), 0xc100);
        assert_eq!(to_f16(65520.0), 0x7c00);
        assert_eq!(to_f16(1.0e-7), 0x0002);
        assert_eq!(to_f16(f64::NAN), 0x7e00);
    }

    #[test]
    fn is_none_inland_and_where_the_ground_stands_above_the_sea() {
        let inland = with_coast(-1.0);
        assert!(build_map(&inland, CHUNK, STEP, 0.0, 0.0, &flat(-5.0), None).is_none());
        let sea = with_coast(2.0);
        assert!(build_map(&sea, CHUNK, STEP, 0.0, 0.0, &flat(5.0), None).is_none());
    }

    #[test]
    fn finds_a_single_hollow_below_sea_level_between_texels() {
        let sea = with_coast(2.0);
        let mut heights = flat(5.0);
        heights[3 + 5 * CHUNK] = -1.0;
        assert!(build_map(&sea, CHUNK, STEP, 0.0, 0.0, &heights, None).unwrap().shows);
    }

    #[test]
    fn keeps_a_map_that_shows_no_water_for_ground_within_the_wet_band() {
        let sea = with_coast(2.0);
        let mut heights = flat(5.0);
        heights[3 + 5 * CHUNK] = ((SWASH_REACH + WET_BAND_REACH) / 2.0) as f32;
        let map = build_map(&sea, CHUNK, STEP, 0.0, 0.0, &heights, None).unwrap();
        assert!(!map.shows);
    }

    #[test]
    fn stores_terrain_heights_relative_to_the_base_level() {
        let sea = HeightGenerator::new(with_coast(2.0).climate().clone(), 9001.0, 1000.0, 2.0).unwrap();
        let heights: Vec<f32> = (0..CHUNK * CHUNK).map(|i| 1000.0 - 3.0 + (i % 7) as f32 * 0.9).collect();
        let map = build_map(&sea, CHUNK, STEP, 0.0, 0.0, &heights, None).unwrap();
        assert_eq!(map.base_level, 1000.0);
        for my in 0..TEXELS {
            for mx in 0..TEXELS {
                let source = heights[mx * STEP + my * STEP * CHUNK] as f64 - 1000.0;
                // Within 3 m of the level, f16 steps are under 2 mm.
                assert!((from_f16(map.heights[mx + my * TEXELS]) - source).abs() < 0.002);
            }
        }
    }

    #[test]
    fn shares_edge_texels_with_its_neighbours() {
        let mut c = lake_climate();
        c.continent.as_mut().unwrap().scale = 40.0;
        c.continent.as_mut().unwrap().coast = 0.5;
        let g = ground(c);
        let span = (CHUNK - 1) as f64;
        let at = |ox: f64, oy: f64| resolve(&g, CHUNK, STEP, ox, oy, None);
        let (centre, right, below) = (at(0.0, 0.0), at(span, 0.0), at(0.0, span));
        let (mut wet, mut dry) = (0, 0);
        for i in 0..TEXELS {
            assert_eq!(right.coverage[i * TEXELS], centre.coverage[i * TEXELS + TEXELS - 1]);
            assert_eq!(below.coverage[(TEXELS - 1) * TEXELS + i], centre.coverage[i]);
        }
        for &c in &centre.coverage {
            if c == 255 {
                wet += 1;
            } else if c == 0 {
                dry += 1;
            }
        }
        assert!(wet > 0 && dry > 0);
    }

    // A chunk offset whose centre sample sits on the first lake `pick` takes.
    fn lake_chunk(pick: impl Fn(&Lake) -> bool) -> (HeightGenerator, Lake, f64, f64) {
        let g = ground(lake_climate());
        let lake = Lakes::of(&g).unwrap().find(-AREA, -AREA, AREA, AREA).into_iter().find(pick).unwrap();
        let (ox, oy) = (lake.u.round(), -lake.v.round());
        (g, lake, ox, oy)
    }

    #[test]
    fn fills_a_lake_with_lake_water_at_its_level() {
        let (g, lake, ox, oy) = lake_chunk(|l| !l.tarn && !l.lagoon);
        let water = resolve(&g, CHUNK, STEP, ox, oy, None);
        let t = (TEXELS - 1) / 2;
        let texel = t + t * TEXELS;
        assert_eq!(water.coverage[texel], 255);
        assert_eq!(water.body_ids[texel], lake.body_id);
        assert_eq!(water.levels[texel], lake.level);
        assert_eq!(water.type_weights[texel * 4 + 1], 255);
        assert!(water.lakes.iter().any(|l| l.body_id == lake.body_id));
    }

    #[test]
    fn blends_a_lagoon_from_lake_water_at_the_centre_to_sea_water_at_the_shore() {
        const BIG: usize = 257;
        let (g, lagoon, ox, oy) = lake_chunk(|l| l.lagoon);
        let water = resolve(&g, BIG, STEP, ox, oy, None);
        let size = (BIG - 1) / STEP + 1;
        let (u0, v0) = crate::lakes::field_origin(BIG, BIG, ox, oy);
        let texel = |u: f64, v: f64| {
            let mx = ((u - u0) / STEP as f64).round() as usize;
            let my = ((v - v0) / STEP as f64).round() as usize;
            mx + my * size
        };
        let centre = texel(lagoon.u, lagoon.v);
        assert_eq!(water.body_ids[centre], lagoon.body_id);
        assert_eq!(water.levels[centre], 0.0);
        assert!(water.type_weights[centre * 4 + 1] > water.type_weights[centre * 4]);
        let (u, v) = along(&lagoon, 0.0, 0.95);
        let shore = texel(u, v);
        assert!(water.type_weights[shore * 4] > water.type_weights[shore * 4 + 1]);
    }

    mod edit {
        use super::*;

        fn edit() -> WaterEdit {
            let texels = TEXELS * TEXELS;
            WaterEdit {
                size: TEXELS,
                step: STEP as f64,
                weights: vec![0; texels * EDIT_CHANNELS],
                level: vec![0.0; texels],
                body_ids: vec![0; texels],
            }
        }

        fn fill(e: &mut WaterEdit, channel: usize, value: u8) {
            let plane = e.size * e.size;
            e.weights[channel * plane..(channel + 1) * plane].fill(value);
        }

        // Every texel owned outright, holding `coverage` of lake water at `level`.
        fn own_all(coverage: f64, level: f32) -> WaterEdit {
            let mut e = edit();
            fill(&mut e, 0, 255);
            fill(&mut e, 1, (coverage * 255.0).round() as u8);
            fill(&mut e, 2 + 1, 255);
            e.level.fill(level);
            e.body_ids.fill(7);
            e
        }

        fn sea() -> WaterPoint {
            WaterPoint { coverage: 1.0, level: 12.0, ocean: 1.0, body_id: 0, types: [1.0, 0.0, 0.0, 0.0] }
        }

        #[test]
        fn leaves_the_generated_water_where_the_edit_owns_nothing() {
            let mut water = sea();
            edit().apply(8.0, 8.0, &mut water);
            assert_eq!((water.coverage, water.level, water.body_id, water.types), (1.0, 12.0, 0, [1.0, 0.0, 0.0, 0.0]));
        }

        #[test]
        fn adds_water_on_dry_ground_at_its_own_level_and_type() {
            let mut water = WaterPoint { level: 0.0, ..Default::default() };
            own_all(1.0, 30.0).apply(9.5, 20.0, &mut water);
            assert_eq!(water.coverage, 1.0);
            assert!((water.level - 30.0).abs() < 1e-9);
            assert_eq!(water.body_id, 7);
            assert_eq!(water.types, [0.0, 1.0, 0.0, 0.0]);
        }

        #[test]
        fn removes_generated_water_and_keeps_its_level() {
            let mut water = sea();
            own_all(0.0, 30.0).apply(8.0, 8.0, &mut water);
            assert_eq!(water.coverage, 0.0);
            assert_eq!(water.level, 12.0);
        }

        #[test]
        fn shares_a_point_by_its_authority() {
            let mut e = own_all(0.0, 30.0);
            fill(&mut e, 0, (255.0f64 * 0.25).round() as u8);
            let mut water = sea();
            e.apply(8.0, 8.0, &mut water);
            assert!((water.coverage - 0.75).abs() < 0.01);
        }

        #[test]
        fn blends_into_the_resolved_water() {
            let g = with_coast(-1.0);
            let water = resolve(&g, CHUNK, STEP, 0.0, 0.0, Some(own_all(1.0, 30.0)));
            assert!(water.covered);
            assert!(water.coverage.iter().all(|&c| c == 255));
            assert!(water.body_ids.iter().all(|&id| id == 7));
        }
    }
}

mod mesh {
    use crate::mesh::{build, lod_step, Mesh};

    const SIZE: usize = 33;

    // A field with an apron ring, from world sample position.
    fn field(apron: usize, offset: (i64, i64), height: impl Fn(f64, f64) -> f64) -> Vec<f32> {
        let f = SIZE + 2 * apron;
        let mut h = Vec::with_capacity(f * f);
        for y in 0..f {
            for x in 0..f {
                let wx = (x as i64 - apron as i64 + offset.0) as f64;
                let wy = (y as i64 - apron as i64 + offset.1) as f64;
                h.push(height(wx, wy) as f32);
            }
        }
        h
    }

    fn hills(x: f64, y: f64) -> f64 {
        (x * 0.3).sin() * 4.0 + (y * 0.17).cos() * 6.0
    }

    fn normal(m: &Mesh, i: usize) -> [f32; 3] {
        [m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]]
    }

    #[test]
    fn lays_one_vertex_every_lod_step_plus_a_skirt_per_edge() {
        let h = field(0, (0, 0), |_, _| 0.0);
        for lod in [0, 1, 2, 4, 8] {
            let m = build(&h, SIZE, 0, lod, 2.0).unwrap();
            let vpl = (SIZE - 1) / lod_step(lod) + 1;
            assert_eq!(m.vertices.len(), (vpl * vpl + 4 * vpl) * 3);
            assert_eq!(m.uvs.len(), m.vertices.len() / 3 * 2);
            assert_eq!(m.normals.len(), m.vertices.len());
            assert_eq!(m.indices.len(), ((vpl - 1) * (vpl - 1) + 4 * (vpl - 1)) * 6);
            let count = (m.vertices.len() / 3) as u32;
            assert!(m.indices.iter().all(|&i| i < count));
        }
    }

    #[test]
    fn centres_the_chunk_and_runs_z_against_the_sample_rows() {
        let m = build(&field(0, (0, 0), |_, _| 0.0), SIZE, 0, 0, 2.0).unwrap();
        let half = (SIZE - 1) as f32;
        assert_eq!(&m.vertices[..3], &[-half, 0.0, half]);
        let last = (SIZE * SIZE - 1) * 3;
        assert_eq!(&m.vertices[last..last + 3], &[half, 0.0, -half]);
        assert_eq!(&m.uvs[(SIZE * SIZE - 1) * 2..SIZE * SIZE * 2], &[1.0, 1.0]);
    }

    #[test]
    fn faces_every_surface_triangle_up() {
        let m = build(&field(1, (0, 0), hills), SIZE, 1, 0, 2.0).unwrap();
        let surface = (SIZE - 1) * (SIZE - 1) * 6;
        let v = |i: u32| {
            let i = i as usize * 3;
            [m.vertices[i] as f64, m.vertices[i + 1] as f64, m.vertices[i + 2] as f64]
        };
        for t in m.indices[..surface].chunks(3) {
            let (a, b, c) = (v(t[0]), v(t[1]), v(t[2]));
            let (e1, e2) = ([b[0] - a[0], b[2] - a[2]], [c[0] - a[0], c[2] - a[2]]);
            // y of (b - a) × (c - a).
            assert!(e1[1] * e2[0] - e1[0] * e2[1] > 0.0);
        }
    }

    #[test]
    fn tilts_normals_against_the_slope() {
        // Rising 1 m per sample toward +x, at 2 m per sample.
        let m = build(&field(1, (0, 0), |x, _| x), SIZE, 1, 0, 2.0).unwrap();
        let n = normal(&m, SIZE * 16 + 16);
        let expected = 1.0 / 5f32.sqrt();
        assert!((n[0] + expected).abs() < 1e-6 && (n[1] - 2.0 * expected).abs() < 1e-6 && n[2].abs() < 1e-6);
        let flat = build(&field(0, (0, 0), |_, _| 3.0), SIZE, 0, 0, 2.0).unwrap();
        assert!(flat.normals.chunks(3).all(|n| n == [0.0, 1.0, 0.0]));
    }

    #[test]
    fn shades_shared_edges_as_the_neighbour_does_with_an_apron() {
        let span = (SIZE - 1) as i64;
        let left = build(&field(1, (0, 0), hills), SIZE, 1, 0, 2.0).unwrap();
        let right = build(&field(1, (span, 0), hills), SIZE, 1, 0, 2.0).unwrap();
        for y in 0..SIZE {
            assert_eq!(normal(&right, y * SIZE), normal(&left, y * SIZE + SIZE - 1));
        }
        // A coarser LOD shades its edge from the same gradient.
        let coarse = build(&field(1, (span, 0), hills), SIZE, 1, 2, 2.0).unwrap();
        let vpl = (SIZE - 1) / lod_step(2) + 1;
        for gy in 0..vpl {
            assert_eq!(normal(&coarse, gy * vpl), normal(&left, gy * lod_step(2) * SIZE + SIZE - 1));
        }
    }

    #[test]
    fn hangs_skirts_below_the_edge_they_copy() {
        let m = build(&field(0, (0, 0), hills), SIZE, 0, 0, 2.0).unwrap();
        let surface = SIZE * SIZE;
        for (i, edge) in (0..SIZE).enumerate() {
            let s = (surface + i) * 3;
            assert_eq!(m.vertices[s], m.vertices[edge * 3]);
            assert!(m.vertices[s + 1] < m.vertices[edge * 3 + 1]);
            assert_eq!(normal(&m, surface + i), normal(&m, edge));
        }
    }

    #[test]
    fn rejects_a_field_that_does_not_fit() {
        let h = field(0, (0, 0), |_, _| 0.0);
        assert!(build(&h, SIZE, 1, 0, 2.0).is_err());
        assert!(build(&h, SIZE, 0, 3, 2.0).is_err());
        assert!(build(&h, SIZE, 0, 0, 0.0).is_err());
    }
}

mod scatter {
    use super::lakes::{ground, lake_climate};
    use super::*;
    use crate::scatter::{
        kill_key, rule_density, rule_water, Jitter, LayerInstances, SampleBox, ScatterGenerator, ScatterLayer,
        ScatterRequest, INSTANCE_STRIDE,
    };
    use crate::PaintMask;

    const SIZE: usize = 65;

    fn rule(layer: &str, density: f64) -> ScatterRule {
        ScatterRule {
            layer: layer.into(),
            density,
            slope: None,
            height: None,
            noise: None,
            water_depth: None,
            water_type: None,
            underwater: false,
        }
    }

    fn layer(name: &str, footprint: f64, align: f64) -> ScatterLayer {
        ScatterLayer {
            name: name.into(),
            footprint,
            jitter: Jitter { scale: Band { from: 0.8, to: 1.2 }, yaw: None, tilt: Some(10.0) },
            align_to_normal: Some(align),
            y_offset: Some(0.25),
        }
    }

    fn library() -> Vec<ScatterLayer> {
        vec![layer("rock", 2.0, 1.0), layer("grass", 1.0, 0.0), layer("painted", 1.5, 0.0)]
    }

    /// Rocks in every biome, grass only on the plain, and a layer only paint
    /// grows.
    fn scatter_climate() -> ClimateConfig {
        let mut c = lake_climate();
        c.lakes = None;
        c.biomes[0].scatter = vec![rule("rock", 0.6), rule("grass", 0.8)];
        c.biomes[1].scatter = vec![rule("rock", 0.9)];
        c
    }

    struct World {
        ground: HeightGenerator,
        scatter: ScatterGenerator,
    }

    fn world() -> World {
        let c = scatter_climate();
        World { ground: ground(c.clone()), scatter: ScatterGenerator::new(c, library(), 9001.0, 0.0, 2.0).unwrap() }
    }

    impl World {
        fn place(&self, ox: f64, oy: f64, request: ScatterRequest) -> Vec<LayerInstances> {
            let heights = self.ground.generate(SIZE, SIZE, ox, oy);
            self.scatter.generate(&self.ground, &heights, SIZE, ox, oy, request).unwrap()
        }
    }

    fn with_ids<'a>() -> ScatterRequest<'a> {
        ScatterRequest { with_ids: true, ..Default::default() }
    }

    fn total(layers: &[LayerInstances]) -> usize {
        layers.iter().map(|l| l.count).sum()
    }

    // Each instance as (slot, x, z) in global millimetres, for a chunk at
    // chunk offset (ox, oy) of 2 m samples.
    fn global(layers: &[LayerInstances], ox: f64, oy: f64) -> Vec<(usize, i64, i64)> {
        layers
            .iter()
            .flat_map(|l| {
                l.data.chunks(INSTANCE_STRIDE).map(move |d| {
                    let x = d[0] as f64 + ox * 2.0;
                    let z = d[2] as f64 - oy * 2.0;
                    (l.slot, (x * 1000.0).round() as i64, (z * 1000.0).round() as i64)
                })
            })
            .collect()
    }

    mod rules {
        use super::*;

        fn pebbles() -> ScatterRule {
            ScatterRule {
                slope: Some(Selector::One(Band { from: 40.0, to: 10.0 })),
                height: Some(Selector::One(Band { from: 0.0, to: 50.0 })),
                ..rule("pebbles", 0.4)
            }
        }

        #[test]
        fn scales_the_density_by_the_product_of_its_selectors() {
            assert!((rule_density(&pebbles(), 100.0, 0.0, 0.0) - 0.4).abs() < 1e-12);
            assert_eq!(rule_density(&pebbles(), 100.0, 60.0, 0.0), 0.0);
            assert_eq!(rule_density(&pebbles(), -10.0, 0.0, 0.0), 0.0);
            assert_eq!(rule_density(&pebbles(), 100.0, 0.0, 0.0), rule_density(&pebbles(), 100.0, 0.0, 1.0));
        }

        #[test]
        fn applies_a_noise_selector_when_the_rule_carries_one() {
            let noisy = ScatterRule {
                noise: Some(NoiseSelector { scale: 100.0, seed_salt: 1.0, band: Band { from: 0.4, to: 0.6 } }),
                ..pebbles()
            };
            assert_eq!(rule_density(&noisy, 100.0, 0.0, 0.2), 0.0);
            assert!((rule_density(&noisy, 100.0, 0.0, 0.8) - 0.4).abs() < 1e-12);
        }

        #[test]
        fn multiplies_a_pair_of_bands_into_a_plateau() {
            let treeline = ScatterRule {
                height: Some(Selector::All(vec![Band { from: 40.0, to: 100.0 }, Band { from: 150.0, to: 110.0 }])),
                ..pebbles()
            };
            let at = |h: f64| rule_density(&treeline, h, 0.0, 0.0);
            assert_eq!(at(20.0), 0.0);
            assert!((at(70.0) - 0.2).abs() < 1e-9);
            assert!((at(105.0) - 0.4).abs() < 1e-9);
            assert!((at(130.0) - 0.2).abs() < 1e-9);
            assert_eq!(at(160.0), 0.0);
        }

        #[test]
        fn keeps_a_rule_out_of_the_water_unless_it_grows_underwater() {
            let plain = rule("rock", 1.0);
            assert_eq!(rule_water(&plain, 2.0, 1.0, 1.0, 0.0), 0.0);
            assert_eq!(rule_water(&ScatterRule { underwater: true, ..plain.clone() }, 2.0, 1.0, 1.0, 0.0), 1.0);
            assert_eq!(rule_water(&plain, 2.0, 0.0, 1.0, 0.0), 1.0);
        }

        #[test]
        fn thins_only_a_rule_without_water_conditions_by_the_beach() {
            let plain = rule("rock", 1.0);
            assert_eq!(rule_water(&plain, -1.0, 1.0, 1.0, 0.75), 0.25);
            let shore = ScatterRule { water_depth: Some(Selector::One(Band { from: -4.0, to: -2.0 })), ..plain };
            assert_eq!(rule_water(&shore, -1.0, 1.0, 1.0, 0.75), 1.0);
        }

        #[test]
        fn grows_by_depth_coverage_and_type_weight() {
            let shelf = ScatterRule {
                underwater: true,
                water_depth: Some(Selector::One(Band { from: 1.0, to: 3.0 })),
                ..rule("weed", 1.0)
            };
            assert_eq!(rule_water(&shelf, 0.5, 1.0, 1.0, 0.0), 0.0);
            assert_eq!(rule_water(&shelf, 4.0, 1.0, 1.0, 0.0), 1.0);
            assert_eq!(rule_water(&shelf, 4.0, 0.5, 1.0, 0.0), 0.5);
            assert_eq!(rule_water(&shelf, 4.0, 0.0, 1.0, 0.0), 0.0);
            let lake = ScatterRule { water_type: Some("lake".into()), ..rule("reed", 1.0) };
            assert_eq!(rule_water(&lake, -1.0, 1.0, 0.0, 0.0), 0.0);
            assert_eq!(rule_water(&lake, -1.0, 1.0, 0.5, 0.0), 0.5);
        }

        #[test]
        fn packs_a_kill_key_as_the_ts_does() {
            // scatterKillKey(3, 5, 7) in ScatterKillSet.ts.
            assert_eq!(kill_key(3, 5, 7), (3 << 24) | (7 << 12) | 5);
            assert_eq!(kill_key(255, 4095, 4095), 0xffff_ffff);
            assert_eq!(kill_key(0, 0, 0), 0);
        }
    }

    #[test]
    fn is_a_pure_function_of_its_inputs() {
        let w = world();
        let a = w.place(128.0, -64.0, with_ids());
        let b = w.place(128.0, -64.0, with_ids());
        assert!(total(&a) > 100);
        for (x, y) in a.iter().zip(&b) {
            assert_eq!((x.slot, &x.data, &x.ids), (y.slot, &y.data, &y.ids));
        }
    }

    #[test]
    fn places_only_the_layers_its_biomes_grow_in_slot_order() {
        let layers = world().place(0.0, 0.0, ScatterRequest::default());
        let slots: Vec<_> = layers.iter().map(|l| l.slot).collect();
        assert!(slots.windows(2).all(|w| w[0] < w[1]));
        assert!(!slots.contains(&2));
    }

    #[test]
    fn keeps_instances_inside_the_chunk_with_unit_rotations() {
        let layers = world().place(0.0, 0.0, ScatterRequest::default());
        let edge = (SIZE - 1) as f32;
        for l in &layers {
            for d in l.data.chunks(INSTANCE_STRIDE) {
                assert!(d[0] >= -edge && d[0] < edge && d[2] <= edge && d[2] > -edge);
                let q = (d[3] * d[3] + d[4] * d[4] + d[5] * d[5] + d[6] * d[6]).sqrt();
                assert!((q - 1.0).abs() < 1e-5);
                assert!((0.8..=1.2).contains(&d[7]) && (0.0..1.0).contains(&d[8]));
            }
        }
    }

    #[test]
    fn places_a_cell_on_a_shared_border_in_one_chunk_only() {
        let w = world();
        let span = (SIZE - 1) as f64;
        let mut both = global(&w.place(0.0, 0.0, ScatterRequest::default()), 0.0, 0.0);
        both.extend(global(&w.place(span, 0.0, ScatterRequest::default()), span, 0.0));
        let count = both.len();
        both.sort();
        both.dedup();
        assert_eq!(both.len(), count);
    }

    #[test]
    fn places_inside_a_region_exactly_what_the_whole_chunk_does() {
        let w = world();
        let whole = w.place(0.0, 0.0, with_ids());
        let region = SampleBox { x0: 10.0, y0: 20.0, x1: 30.0, y1: 40.0 };
        let part = w.place(0.0, 0.0, ScatterRequest { region: Some(region), ..with_ids() });
        assert!(total(&part) > 0 && total(&part) < total(&whole));
        for l in &part {
            let full = whole.iter().find(|f| f.slot == l.slot).unwrap();
            for (i, id) in l.ids.iter().enumerate() {
                let j = full.ids.iter().position(|f| f == id).unwrap();
                assert_eq!(
                    &l.data[i * INSTANCE_STRIDE..(i + 1) * INSTANCE_STRIDE],
                    &full.data[j * INSTANCE_STRIDE..(j + 1) * INSTANCE_STRIDE]
                );
            }
        }
    }

    #[test]
    fn drops_exactly_the_instances_the_kill_set_names() {
        let w = world();
        let whole = w.place(0.0, 0.0, with_ids());
        let mut kills: Vec<u32> = whole.iter().flat_map(|l| l.ids.iter().step_by(3).copied()).collect();
        kills.sort();
        let kept = w.place(0.0, 0.0, ScatterRequest { kills: &kills, ..with_ids() });
        assert_eq!(total(&kept), total(&whole) - kills.len());
        assert!(kept.iter().all(|l| l.ids.iter().all(|id| kills.binary_search(id).is_err())));
    }

    // A density mask over the test library, every channel `fill(channel)`.
    fn density_weights(fill: impl Fn(usize) -> u8) -> Vec<u8> {
        let size = (SIZE - 1) / 4 + 1;
        (0..library().len() + 1).flat_map(|c| std::iter::repeat_n(fill(c), size * size)).collect()
    }

    fn density_mask(weights: &[u8]) -> PaintMask<'_> {
        let size = (SIZE - 1) / 4 + 1;
        PaintMask { size, step: 4.0, channels: library().len() + 1, weights }
    }

    #[test]
    fn grows_a_painted_layer_no_biome_grows() {
        let weights = density_weights(|c| if c == 2 { 255 } else { 0 });
        let layers = world().place(0.0, 0.0, ScatterRequest { density_mask: Some(density_mask(&weights)), ..Default::default() });
        assert!(layers.iter().any(|l| l.slot == 2 && l.count > 0));
    }

    #[test]
    fn clears_every_layer_through_the_exclusion_channel() {
        let weights = density_weights(|c| if c >= 2 { 255 } else { 0 });
        let layers = world().place(0.0, 0.0, ScatterRequest { density_mask: Some(density_mask(&weights)), ..Default::default() });
        assert_eq!(total(&layers), 0);
    }

    #[test]
    fn ignores_a_density_mask_with_the_wrong_channel_count() {
        let w = world();
        let plain = total(&w.place(0.0, 0.0, ScatterRequest::default()));
        let weights = vec![255u8; 17 * 17 * 2];
        let mask = PaintMask { size: 17, step: 4.0, channels: 2, weights: &weights };
        assert_eq!(total(&w.place(0.0, 0.0, ScatterRequest { density_mask: Some(mask), ..Default::default() })), plain);
    }

    #[test]
    fn rejects_a_footprint_too_fine_for_a_kill_key_and_the_wrong_heights() {
        let c = scatter_climate();
        let fine = vec![layer("rock", 0.0001, 0.0), layer("grass", 1.0, 0.0), layer("painted", 1.0, 0.0)];
        let g = ground(c.clone());
        let s = ScatterGenerator::new(c, fine, 9001.0, 0.0, 2.0).unwrap();
        let heights = g.generate(SIZE, SIZE, 0.0, 0.0);
        assert!(s.generate(&g, &heights, SIZE, 0.0, 0.0, ScatterRequest::default()).is_err());
        assert!(s.generate(&g, &heights[1..], SIZE, 0.0, 0.0, ScatterRequest::default()).is_err());
    }

    #[test]
    fn rejects_a_rule_for_a_layer_the_library_lacks() {
        let mut c = scatter_climate();
        c.biomes[0].scatter.push(rule("missing", 1.0));
        assert!(ScatterGenerator::new(c, library(), 9001.0, 0.0, 2.0).is_err());
    }
}

mod climate_rules {
    use super::*;
    use crate::climate::{
        coastal_moisture_at, continent_land_weight, continent_seabed_depth, ocean_coverage, reachable_biomes,
        resolve_biomes,
    };
    use crate::splat::coast_weights;

    fn continent() -> ContinentConfig {
        climate(false).continent.unwrap()
    }

    fn coast() -> CoastConfig {
        CoastConfig {
            beach_height: 2.5,
            wet_height: 0.6,
            seabed_depth: 1.5,
            blend: 1.0,
            slope: Band { from: 30.0, to: 15.0 },
        }
    }

    #[test]
    fn keeps_all_the_land_height_inland_and_none_on_the_sea_bed() {
        let c = continent();
        assert_eq!(continent_land_weight(&c, c.coast + c.blend_half_width), 1.0);
        assert_eq!(continent_land_weight(&c, c.coast - c.blend_half_width), 0.0);
        assert!((continent_land_weight(&c, c.coast) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn falls_from_the_coast_across_the_shelf_to_the_ocean_floor() {
        let c = continent();
        assert_eq!(continent_seabed_depth(&c, c.coast + 0.1), 0.0);
        assert_eq!(continent_seabed_depth(&c, c.coast), 0.0);
        assert!((continent_seabed_depth(&c, c.coast - c.shelf_width) - c.shelf_depth).abs() < 1e-9);
        assert!((continent_seabed_depth(&c, c.coast - c.shelf_width - c.slope_width) - c.ocean_depth).abs() < 1e-9);
        let mut previous = 0.0;
        let mut v = c.coast;
        while v >= 0.0 {
            let depth = continent_seabed_depth(&c, v);
            assert!(depth >= previous - 1e-9);
            previous = depth;
            v -= 0.005;
        }
    }

    #[test]
    fn covers_the_whole_coast_blend_with_ocean_and_fades_out_inland() {
        let c = continent();
        let half = c.blend_half_width;
        assert_eq!(ocean_coverage(&c, 0.0), 1.0);
        assert_eq!(ocean_coverage(&c, c.coast + half), 1.0);
        assert!((ocean_coverage(&c, c.coast + 1.5 * half) - 0.5).abs() < 1e-9);
        assert_eq!(ocean_coverage(&c, c.coast + 2.0 * half), 0.0);
    }

    #[test]
    fn adds_coastal_moisture_at_the_coast_and_seaward_fading_inland() {
        let c = continent();
        let (amount, reach) = (c.coastal_moisture.unwrap(), c.coastal_moisture_reach.unwrap());
        assert_eq!(coastal_moisture_at(&c, c.coast - 0.1), amount);
        assert_eq!(coastal_moisture_at(&c, c.coast), amount);
        assert!((coastal_moisture_at(&c, c.coast + reach / 2.0) - amount / 2.0).abs() < 1e-9);
        assert_eq!(coastal_moisture_at(&c, c.coast + reach), 0.0);
        assert_eq!(coastal_moisture_at(&ContinentConfig { coastal_moisture: None, ..c }, 0.0), 0.0);
    }

    #[test]
    fn lays_dry_sand_wet_sand_and_sea_bed_down_the_beach() {
        let sharp = CoastConfig { blend: 0.5, ..coast() };
        assert_eq!(coast_weights(&sharp, 2.0, 0.0, 1.0), (1.0, [1.0, 0.0, 0.0]));
        assert_eq!(coast_weights(&sharp, 0.0, 0.0, 1.0).1, [0.0, 1.0, 0.0]);
        assert_eq!(coast_weights(&sharp, -5.0, 0.0, 1.0).1, [0.0, 0.0, 1.0]);
        let c = coast();
        assert_eq!(coast_weights(&c, c.beach_height + c.blend + 1.0, 0.0, 1.0).0, 0.0);
        assert_eq!(coast_weights(&c, 1.0, 45.0, 1.0).0, 0.0);
        assert_eq!(coast_weights(&c, 1.0, 0.0, 0.0).0, 0.0);
    }

    #[test]
    fn splits_exactly_the_beach_total_even_when_blends_overlap() {
        let overlapping = CoastConfig { wet_height: 0.2, seabed_depth: 0.5, blend: 3.0, ..coast() };
        for c in [coast(), overlapping] {
            let mut h = -8.0;
            while h <= 8.0 {
                let (total, bands) = coast_weights(&c, h, 10.0, 0.7);
                assert!((bands.iter().sum::<f64>() - total).abs() < 1e-9);
                assert!(bands.iter().all(|&w| w >= 0.0));
                h += 0.25;
            }
        }
    }

    #[test]
    fn reaches_every_biome_any_sample_between_the_bounds_resolves() {
        let c = climate(false);
        let g = generator(false);
        for (ox, oy) in [(0.0, 0.0), (448.0, -320.0), (-2048.0, 1024.0), (900.0, 900.0)] {
            let grid = g.climate_grid(ox, oy, SIZE, SIZE);
            let (lo, hi) = grid.bounds();
            let reachable = reachable_biomes(&c, &lo, &hi);
            for j in 0..SIZE {
                for i in 0..SIZE {
                    let blend = resolve_biomes(&c, &grid.at(ox + i as f64, oy + j as f64));
                    assert!(blend.biomes[..blend.count].iter().all(|b| reachable.contains(b)));
                }
            }
        }
    }

    #[test]
    fn builds_the_same_far_map_a_few_rows_at_a_time() {
        let c = climate(false);
        let ground = generator(false);
        let spec = crate::SplatSpec { palette: vec![], coast_materials: vec![] };
        let splat = crate::SplatGenerator::new(c, &spec, 4321.0, 2.0, 2.0).unwrap();
        let mut whole = crate::FarMap::new(500.0, -700.0, 4000.0, 8);
        assert!(whole.build(&ground, &splat, usize::MAX));
        let mut sliced = crate::FarMap::new(500.0, -700.0, 4000.0, 8);
        let mut frames = 0;
        while !sliced.build(&ground, &splat, 3) {
            frames += 1;
        }
        assert_eq!(frames, 5);
        assert_eq!((sliced.ground, sliced.weights), (whole.ground, whole.weights));
    }
}
