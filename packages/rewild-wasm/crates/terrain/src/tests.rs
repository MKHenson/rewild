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
