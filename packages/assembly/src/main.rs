use assembly::run;

fn main() {
    pollster::block_on(run());
}
