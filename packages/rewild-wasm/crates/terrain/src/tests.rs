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
    Biome { name: name.into(), deformations, erosion, layers: Vec::new() }
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
