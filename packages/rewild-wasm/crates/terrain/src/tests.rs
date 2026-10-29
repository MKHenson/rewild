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
    Biome { name: name.into(), deformations, erosion }
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
